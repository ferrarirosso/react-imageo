import { ApplicationCustomizerContext } from '@microsoft/sp-application-base';
import * as strings from 'ImageoApplicationCustomizerStrings';

export interface IFinderEntry {
  kind: 'library' | 'folder' | 'image';
  name: string;
  serverRelativeUrl: string; // Decoded ResourcePath, including literal # and % in file names.
  title?: string;
  creator?: string;
  created?: string;
  modified?: string;
}

export interface IGallerySort {
  field: 'created' | 'creator' | 'modified';
  descending: boolean;
}

export type GalleryFileType = 'all' | 'png' | 'jpeg';

export interface IFinderPage {
  entries: IFinderEntry[];
  more?: () => Promise<IFinderPage>;
}

export interface IEditorAsset {
  name: string;
  serverRelativeUrl: string;
  imageBase64: string;
}

interface ICollectionRow {
  Name?: string;
  Title?: string;
  ServerRelativePath?: { DecodedUrl: string };
  RootFolder?: { ServerRelativePath: { DecodedUrl: string } };
  TimeCreated?: string;
  TimeLastModified?: string;
  Author?: { Title?: string };
  ListItemAllFields?: { Title?: string };
}

interface IAssetListItem {
  FileRef: string;
  FileLeafRef: string;
  FSObjType: number;
  Title?: string;
  Author?: { Title?: string };
  Created?: string;
  Modified?: string;
}

interface ICollectionQuery {
  url: string;
  kind: IFinderEntry['kind'];
}

export const MAX_IMAGE_PIXELS = 4194304;
const MAX_PNG_BYTES = 36 * 1024 * 1024;
function imageType(name: string): 'png' | 'jpeg' | undefined {
  const suffix = /\.(png|jpe?g)$/i.exec(name)?.[1];
  return suffix ? (suffix.toLowerCase() === 'png' ? 'png' : 'jpeg') : undefined;
}
const PAGE_SIZE = 40;

export interface IOpenedImage {
  image: HTMLImageElement;
  blob: Blob;
  isPng: boolean;
  targetWidth: number;
  targetHeight: number;
}

export function fitEditorImage(width: number, height: number): { width: number; height: number } {
  // Keep very thin images inside browser canvas dimension limits as well.
  const scale = Math.min(1, Math.sqrt(MAX_IMAGE_PIXELS / (width * height)), 16384 / Math.max(width, height));
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

function fileDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(strings.FinderInvalid));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

async function encodePng(image: HTMLImageElement, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(strings.FinderInvalid);
  try {
    ctx.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(strings.FinderInvalid)), 'image/png'));
  } finally {
    canvas.setAttribute('width', '0');
    canvas.setAttribute('height', '0');
  }
}

export async function prepareEditorAsset(entry: IFinderEntry, opened: IOpenedImage, resize: boolean): Promise<IEditorAsset> {
  const { image, targetWidth, targetHeight } = opened;
  const requiresResize = image.naturalWidth !== targetWidth || image.naturalHeight !== targetHeight;
  if (requiresResize && !resize) throw new Error(strings.FinderInvalid);

  let png = opened.blob;
  if (!opened.isPng || requiresResize || png.size > MAX_PNG_BYTES) {
    png = await encodePng(image, targetWidth, targetHeight);
  }
  if (!png.size || png.size > MAX_PNG_BYTES) throw new Error(strings.FinderInvalid);
  const imageBase64 = await fileDataUrl(png);
  return { imageBase64, name: entry.name, serverRelativeUrl: entry.serverRelativeUrl };
}

function pathQuery(decoded: string): string {
  return encodeURIComponent("'" + decoded.replace(/'/g, "''") + "'");
}

function accessError(status: number): Error {
  if (status === 401 || status === 403) return new Error(strings.FinderDenied);
  if (status === 404) return new Error(strings.FinderMissing);
  return new Error(strings.FinderFailure + ' (HTTP ' + status + ')');
}

export class EditorAssets {
  private readonly base: string;
  private readonly webPath: string;
  private readonly origin: string;
  private readonly collator: Intl.Collator;
  private snapshot?: { controller: AbortController; entries: Promise<IFinderEntry[]> };

  public constructor(ctx: ApplicationCustomizerContext) {
    this.base = ctx.pageContext.web.absoluteUrl.replace(/\/+$/, '');
    const url = new URL(this.base);
    this.origin = url.origin;
    this.webPath = decodeURIComponent(url.pathname).replace(/\/+$/, '');
    this.collator = new Intl.Collator(ctx.pageContext.cultureInfo?.currentUICultureName || undefined,
      { sensitivity: 'base', numeric: true });
  }

  private inWeb(path: string): boolean {
    return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') &&
      path.toLowerCase().startsWith(this.webPath.toLowerCase() + '/') &&
      !path.split('/').some(part => part === '..' || part === '.');
  }

  public thumbnail(path: string): string {
    return this.base + '/_layouts/15/getpreview.ashx?resolution=0&path=' + encodeURIComponent(this.contentUrl(path));
  }

  public contentUrl(path: string): string {
    return this.origin + path.split('/').map(encodeURIComponent).join('/');
  }

  public libraries(): Promise<IFinderPage> {
    const url = this.base + '/_api/web/lists?$filter=BaseType eq 1 and Hidden eq false' +
      '&$select=Title,RootFolder/ServerRelativePath&$expand=RootFolder&$orderby=Title&$top=' + PAGE_SIZE;
    return this.readCollections([{ url, kind: 'library' }]);
  }

  public folder(entry: IFinderEntry, fileType: GalleryFileType = 'all', signal?: AbortSignal): Promise<IFinderPage> {
    const path = entry.serverRelativeUrl;
    if (entry.kind === 'image' || !this.inWeb(path)) throw new Error(strings.FinderDenied);
    const folder = this.base + '/_api/web/GetFolderByServerRelativePath(decodedurl=@p)/';
    const params = '?@p=' + pathQuery(path) + '&$top=' + PAGE_SIZE + '&$orderby=Name&$select=Name,ServerRelativePath';
    return this.readCollections([
      { url: folder + 'Folders' + params, kind: 'folder' },
      { url: folder + 'Files' + params + ',TimeCreated,TimeLastModified,Author/Title,ListItemAllFields/Title&$expand=Author,ListItemAllFields', kind: 'image' },
    ], fileType, signal, entry.kind === 'library');
  }

  private async readPage<T>(url: string, signal?: AbortSignal, skipInaccessibleLibrary = false): Promise<{ rows: T[]; next: string }> {
    const endpoint = new URL(url, this.base + '/');
    if (endpoint.origin !== this.origin || !endpoint.pathname.toLowerCase().startsWith(new URL(this.base + '/_api/').pathname.toLowerCase())) {
      throw new Error(strings.FinderDenied);
    }
    const res = await fetch(endpoint.href, { credentials: 'same-origin', signal, headers: { Accept: 'application/json;odata=nometadata' } });
    if (skipInaccessibleLibrary && (res.status === 403 || res.status === 404)) return { rows: [], next: '' };
    if (!res.ok) throw accessError(res.status);
    const data = await res.json() as { value: T[]; 'odata.nextLink'?: string; '@odata.nextLink'?: string };
    const next = data['odata.nextLink'] || data['@odata.nextLink'];
    return { rows: data.value, next: next ? new URL(next, endpoint.href).href : '' };
  }

  private async readCollections(queries: ICollectionQuery[], fileType: GalleryFileType = 'all', signal?: AbortSignal, atLibraryRoot = false): Promise<IFinderPage> {
    const pages = await Promise.all(queries.map(async ({ url, kind }) => {
      const { rows, next } = await this.readPage<ICollectionRow>(url, signal);
      const entries: IFinderEntry[] = [];
      for (const row of rows) {
        const path = row.RootFolder?.ServerRelativePath?.DecodedUrl || row.ServerRelativePath?.DecodedUrl;
        const name = row.Title || row.Name;
        if (!name || !path || !this.inWeb(path)) continue;
        if (kind === 'image') {
          const type = imageType(name);
          if (!type || (fileType !== 'all' && type !== fileType)) continue;
        }
        if (atLibraryRoot && kind === 'folder' && name.toLowerCase() === 'forms') continue;
        entries.push({
          kind, name, serverRelativeUrl: path, title: row.ListItemAllFields?.Title,
          creator: row.Author?.Title, created: row.TimeCreated, modified: row.TimeLastModified,
        });
      }
      return { entries, next, kind };
    }));
    const entries: IFinderEntry[] = [];
    const more: ICollectionQuery[] = [];
    for (const page of pages) {
      entries.push(...page.entries);
      if (page.next) more.push({ url: page.next, kind: page.kind });
    }
    return { entries, more: more.length ? () => this.readCollections(more, fileType, signal, atLibraryRoot) : undefined };
  }

  private async readGallery(signal: AbortSignal): Promise<IFinderEntry[]> {
    const ids: string[] = [];
    let url = this.base + '/_api/web/lists?$filter=BaseType eq 1 and Hidden eq false&$select=Id&$orderby=Id&$top=' + PAGE_SIZE;
    while (url) {
      const page = await this.readPage<{ Id: string }>(url, signal);
      for (const row of page.rows) {
        if (/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(row.Id)) ids.push(row.Id);
      }
      url = page.next;
    }

    const entries: IFinderEntry[] = [];
    let nextLibrary = 0;
    const readLibraries = async (): Promise<void> => {
      while (nextLibrary < ids.length) {
        const id = ids[nextLibrary++];
        // List items include nested folders. Page by indexed ID so this also works in large libraries.
        let items = this.base + "/_api/web/lists(guid'" + id + "')/items" +
          '?$select=Id,FileRef,FileLeafRef,FSObjType,Title,Created,Modified,Author/Title&$expand=Author&$orderby=Id&$top=500';
        while (items) {
          const page = await this.readPage<IAssetListItem>(items, signal, true);
          for (const row of page.rows) {
            if (row.FSObjType !== 0 || !imageType(row.FileLeafRef) || !this.inWeb(row.FileRef)) continue;
            entries.push({
              kind: 'image', name: row.FileLeafRef, serverRelativeUrl: row.FileRef, title: row.Title,
              creator: row.Author?.Title, created: row.Created, modified: row.Modified,
            });
          }
          items = page.next;
        }
      }
    };
    // Fetch at most three library pages at once and keep only image metadata.
    await Promise.all(ids.slice(0, 3).map(() => readLibraries()));
    return entries;
  }

  public invalidateGallery(): void {
    this.snapshot?.controller.abort();
    this.snapshot = undefined;
  }

  public async gallery(text: string, sort: IGallerySort, signal?: AbortSignal, fileType: GalleryFileType = 'all'): Promise<IFinderPage> {
    if (!this.snapshot) {
      const controller = new AbortController();
      const entries = this.readGallery(controller.signal).catch(error => {
        if (this.snapshot?.controller === controller) this.invalidateGallery();
        throw error;
      });
      this.snapshot = { controller, entries };
    }

    const rows = await this.snapshot.entries;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const words = text.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const entries = rows.filter(row => {
      if (fileType !== 'all' && imageType(row.name) !== fileType) return false;
      if (!words.length) return true;
      const value = [row.name, row.title, row.creator].join(' ').toLocaleLowerCase();
      return words.every(word => value.indexOf(word) >= 0);
    });
    // SharePoint dates are UTC ISO timestamps. Use their time values, including fractional seconds.
    entries.sort((a, b) => {
      const left = a[sort.field];
      const right = b[sort.field];
      if (!left && right) return 1;
      if (left && !right) return -1;
      if (left && right) {
        const cmp = sort.field === 'creator' ? this.collator.compare(left, right) : Date.parse(left) - Date.parse(right);
        if (cmp) return sort.descending ? -cmp : cmp;
      }
      return this.collator.compare(a.serverRelativeUrl, b.serverRelativeUrl);
    });
    return { entries };
  }

  public async copyImage(entry: IFinderEntry): Promise<void> {
    const png = this.open(entry, new AbortController().signal).then(({ image, isPng, blob }) =>
      isPng ? blob.slice(0, blob.size, 'image/png') : encodePng(image, image.naturalWidth, image.naturalHeight));
    // Safari needs the write during the click, before the file download finishes.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  }

  public async copyLink(entry: IFinderEntry): Promise<void> {
    if (entry.kind !== 'image' || !this.inWeb(entry.serverRelativeUrl)) throw new Error(strings.FinderDenied);
    await navigator.clipboard.writeText(this.contentUrl(entry.serverRelativeUrl));
  }

  public async open(entry: IFinderEntry, signal: AbortSignal): Promise<IOpenedImage> {
    if (entry.kind !== 'image' || !this.inWeb(entry.serverRelativeUrl)) throw new Error(strings.FinderDenied);
    const url = this.base + '/_api/web/GetFileByServerRelativePath(decodedurl=@p)/$value?@p=' + pathQuery(entry.serverRelativeUrl);
    const res = await fetch(url, { credentials: 'same-origin', signal });
    if (!res.ok) throw accessError(res.status);
    const blob = await res.blob();
    const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => signature[i] === v);
    const isJpeg = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
    if (!isPng && !isJpeg) throw new Error(strings.FinderInvalid);
    const image = new Image();
    const imageUrl = URL.createObjectURL(blob);
    try {
      image.src = imageUrl;
      await image.decode();
    } catch {
      throw new Error(strings.FinderInvalid);
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
    const size = fitEditorImage(image.naturalWidth, image.naturalHeight);
    return { image, blob, isPng, targetWidth: size.width, targetHeight: size.height };
  }
}
