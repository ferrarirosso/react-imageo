import { spfi, SPFx, SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/files';
import '@pnp/sp/folders';
import type { IFolder } from '@pnp/sp/folders/types';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import { ApplicationCustomizerContext } from '@microsoft/sp-application-base';
import { logger } from '../utils/logger';

const IMAGE_FOLDER = 'AIImages';

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
  libraryUrl: string;
}

/**
 * Writes generated images to the AIImages folder in the web's Site Assets library.
 * imageo does NOT modify pages — no DOM manipulation, no canvas/CanvasContent1
 * writes. Publishers place the saved image themselves via the standard Image
 * web part. This is the only thing imageo persists to SharePoint.
 */
export class AssetsUploader {
  private readonly sp: SPFI;
  private readonly webUrl: string;

  public constructor(ctx: ApplicationCustomizerContext) {
    this.sp = spfi().using(SPFx(ctx));
    this.webUrl = ctx.pageContext.web.absoluteUrl;
  }

  private async ensureAssetsFolder(folder: IFolder, parent: IFolder, folderPath: string): Promise<void> {
    try {
      await folder.select('UniqueId')();
      return;
    } catch (err) {
      if ((err as { status?: number })?.status !== 404) throw err;
    }
    try {
      await parent.folders.addUsingPath(folderPath);
    } catch (creationError) {
      // Another tab can create the same folder after the first lookup.
      // Confirm it exists before proceeding with the user's own upload.
      try {
        await folder.select('UniqueId')();
      } catch {
        throw creationError;
      }
    }
  }

  public async uploadImage(
    b64: string,
    fileNameHint: string,
    metadata: { prompt?: string; model?: string }
  ): Promise<IUploadedImage> {
    const assets = await this.sp.web.lists.ensureSiteAssetsLibrary();
    const library = await assets.select('DefaultViewUrl', 'RootFolder/ServerRelativePath').expand('RootFolder')();
    const folderPath = library.RootFolder.ServerRelativePath.DecodedUrl.replace(/\/$/, '') + '/' + IMAGE_FOLDER;
    const folder = this.sp.web.getFolderByServerRelativePath(folderPath);
    await this.ensureAssetsFolder(folder, assets.rootFolder, folderPath);
    const view = new URL(library.DefaultViewUrl, this.webUrl);
    const blob = base64ToBlob(b64, 'image/png');
    const fileName = buildFileName(fileNameHint);

    await folder.files.addUsingPath(fileName, blob, { Overwrite: false });
    const serverRelativeUrl = folderPath + '/' + fileName;
    view.searchParams.set('id', serverRelativeUrl);
    view.searchParams.set('parent', folderPath);

    try {
      const item = this.sp.web.getFileByServerRelativePath(serverRelativeUrl).getItem();
      await (await item).update({
        Title: metadata.prompt ? metadata.prompt.slice(0, 250) : 'imageo-generated',
      });
    } catch (err) {
      logger.warn('Could not set file metadata', err);
    }

    return { serverRelativeUrl, fileName, libraryUrl: view.href };
  }
}
