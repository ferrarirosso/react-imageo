import { spfi, SPFx, SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/files';
import '@pnp/sp/folders';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import { ApplicationCustomizerContext } from '@microsoft/sp-application-base';
import { logger } from '../utils/logger';

const ASSETS_FOLDER = 'SiteAssets/AIImages';

function base64ToBlob(b64: string, contentType = 'image/png'): Blob {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

function buildFileName(hint: string): string {
  const normalized = (hint || 'imageo')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const words = normalized.split('-').filter(Boolean).slice(0, 5);
  const slug = (words.join('-') || 'imageo').slice(0, 60);
  const date = new Date().toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${slug}-${date}-${rand}.png`;
}

export interface IUploadedImage {
  serverRelativeUrl: string;
  fileName: string;
}

/**
 * Writes generated images to the site's image library (SiteAssets/AIImages).
 * imageo does NOT modify pages — no DOM manipulation, no canvas/CanvasContent1
 * writes. Publishers place the saved image themselves via the standard Image
 * web part. This is the only thing imageo persists to SharePoint.
 */
export class AssetsUploader {
  private readonly sp: SPFI;

  public constructor(ctx: ApplicationCustomizerContext) {
    this.sp = spfi().using(SPFx(ctx));
  }

  public async ensureAssetsFolder(): Promise<void> {
    try {
      await this.sp.web.getFolderByServerRelativePath(ASSETS_FOLDER)();
    } catch {
      await this.sp.web.folders.addUsingPath(ASSETS_FOLDER);
      logger.log(`Created folder: ${ASSETS_FOLDER}`);
    }
  }

  public async uploadImage(
    b64: string,
    fileNameHint: string,
    metadata: { prompt?: string; model?: string }
  ): Promise<IUploadedImage> {
    await this.ensureAssetsFolder();
    const blob = base64ToBlob(b64, 'image/png');
    const fileName = buildFileName(fileNameHint);

    const folder = this.sp.web.getFolderByServerRelativePath(ASSETS_FOLDER);
    const result = await folder.files.addUsingPath(fileName, blob, { Overwrite: true });
    const serverRelativeUrl = result.ServerRelativeUrl;

    try {
      const item = this.sp.web.getFileByServerRelativePath(serverRelativeUrl).getItem();
      await (await item).update({
        Title: metadata.prompt ? metadata.prompt.slice(0, 250) : 'imageo-generated',
      });
    } catch (err) {
      logger.warn('Could not set file metadata', err);
    }

    return { serverRelativeUrl, fileName };
  }
}
