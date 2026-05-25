import { spfi, SPFx, SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/files';
import '@pnp/sp/folders';
import { ApplicationCustomizerContext } from '@microsoft/sp-application-base';
import { IBrowserTile } from '../models/IContracts';
import { logger } from '../utils/logger';

const FOLDER = 'SiteAssets/AIImages';

export class AssetsBrowser {
  private readonly sp: SPFI;
  private readonly webAbs: string;
  private readonly webRel: string;

  public constructor(ctx: ApplicationCustomizerContext) {
    this.sp = spfi().using(SPFx(ctx));
    this.webAbs = ctx.pageContext.web.absoluteUrl.replace(/\/+$/, '');
    this.webRel = ctx.pageContext.web.serverRelativeUrl.replace(/\/+$/, '');
  }

  public async listRecent(limit = 20, skip = 0): Promise<IBrowserTile[]> {
    const folderPath = `${this.webRel}/${FOLDER}`;
    try {
      const folder = this.sp.web.getFolderByServerRelativePath(folderPath);
      const files = await folder.files
        .select('Name', 'ServerRelativeUrl', 'TimeLastModified', 'Length', 'ListItemAllFields/Title')
        .expand('ListItemAllFields')
        .orderBy('TimeLastModified', false)
        .top(limit)
        .skip(skip)();
      return files.map((f) => ({
        name: f.Name,
        serverRelativeUrl: f.ServerRelativeUrl,
        timeLastModified: String(f.TimeLastModified),
        length: Number(f.Length) || 0,
        title: (f as { ListItemAllFields?: { Title?: string } }).ListItemAllFields?.Title || undefined,
      }));
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 404) return [];
      logger.warn('listRecent failed', err);
      return [];
    }
  }

  public thumbnailUrl(serverRelativeUrl: string): string {
    return serverRelativeUrl;
  }

  public async copyImage(tile: IBrowserTile): Promise<void> {
    const res = await fetch(tile.serverRelativeUrl);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const blob = await res.blob();
    const type = blob.type || 'image/png';
    await navigator.clipboard.write([
      new ClipboardItem({ [type]: Promise.resolve(blob) }),
    ]);
  }

  public async copyUrl(tile: IBrowserTile): Promise<void> {
    const absolute = tile.serverRelativeUrl.startsWith('http')
      ? tile.serverRelativeUrl
      : `${this.webAbs.replace(this.webRel, '')}${tile.serverRelativeUrl}`;
    await navigator.clipboard.writeText(absolute);
  }
}
