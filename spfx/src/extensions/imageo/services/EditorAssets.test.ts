jest.mock('ImageoApplicationCustomizerStrings', () => ({}), { virtual: true });

import { ApplicationCustomizerContext } from '@microsoft/sp-application-base';
import { EditorAssets } from './EditorAssets';

describe('site image gallery', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('sorts creators across libraries and REST pages and reuses metadata until refreshed', async () => {
    const site = 'https://example.test/sites/editor';
    const libraries = [1, 2, 3].map(id => '00000000-0000-4000-8000-00000000000' + id);
    const file = (name: string, creator: string): object => ({
      FileLeafRef: name, FileRef: '/sites/editor/Library/' + name, FSObjType: 0,
      Title: 'A red sail', Author: { Title: creator },
    });
    const response = (value: object[], next?: string, status = 200): Response =>
      ({ ok: status === 200, status, json: async () => ({ value, 'odata.nextLink': next }) } as Response);

    const fetchPage = jest.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/lists')) return response(libraries.map(Id => ({ Id })));
      if (url.pathname.includes(libraries[2])) return response([], undefined, 403);
      if (url.pathname.includes(libraries[1])) return response([file('middle.JpEg', 'Mira'), file('notes.pdf', 'Zed'), file('scan.tiff', 'Zed')]);
      if (url.searchParams.has('next')) return response([file('nested #10%.png', 'Anna')]);
      url.searchParams.set('next', '2');
      return response([file('first.png', 'Zoe')], url.href);
    });
    globalThis.fetch = fetchPage;

    const assets = new EditorAssets({ pageContext: { web: { absoluteUrl: site } } } as ApplicationCustomizerContext);
    const ascending = await assets.gallery('', { field: 'creator', descending: false });
    expect(ascending.entries.map(row => row.creator)).toEqual(['Anna', 'Mira', 'Zoe']);
    expect(fetchPage).toHaveBeenCalledTimes(5);
    const descending = await assets.gallery('RED sail', { field: 'creator', descending: true });
    expect(descending.entries.map(row => row.creator)).toEqual(['Zoe', 'Mira', 'Anna']);
    const match = await assets.gallery('anna nested', { field: 'creator', descending: false });
    expect(match.entries.map(row => row.name)).toEqual(['nested #10%.png']);
    const jpeg = await assets.gallery('red sail', { field: 'creator', descending: true }, undefined, 'jpeg');
    expect(jpeg.entries.map(row => row.name)).toEqual(['middle.JpEg']);
    const png = await assets.gallery('red sail', { field: 'creator', descending: true }, undefined, 'png');
    expect(png.entries.map(row => row.name)).toEqual(['first.png', 'nested #10%.png']);
    expect(fetchPage).toHaveBeenCalledTimes(5);
    assets.invalidateGallery();
    await assets.gallery('', { field: 'creator', descending: false });
    expect(fetchPage).toHaveBeenCalledTimes(10);
  });

  it('keeps subfolders and finds both JPEG extensions across folder continuation pages', async () => {
    const site = 'https://example.test/sites/editor';
    const path = '/sites/editor/Library';
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      const parent = url.searchParams.get('@p')?.slice(1, -1);
      const folders = url.pathname.endsWith('/Folders');
      const later = url.searchParams.has('next');
      const items = folders ? ['Scans', 'Forms'] : later ? ['Bird.JPG', 'Boat.jpeg', 'scan.tif'] : ['Blue.png'];
      url.searchParams.set('next', '1');
      return { ok: true, json: async () => ({
        value: items.map(Name => ({ Name, ServerRelativePath: { DecodedUrl: parent + '/' + Name } })),
        'odata.nextLink': folders || later ? undefined : url.href,
      }) } as Response;
    };
    const assets = new EditorAssets({ pageContext: { web: { absoluteUrl: site } } } as ApplicationCustomizerContext);
    const first = await assets.folder({ kind: 'library', name: 'Library', serverRelativeUrl: path }, 'jpeg');
    expect(first.entries.map(item => item.name)).toEqual(['Scans']);
    const later = await first.more?.();
    expect(later?.entries.map(item => item.name)).toEqual(['Bird.JPG', 'Boat.jpeg']);
    expect(later?.more).toBeUndefined();
    const nested = await assets.folder(first.entries[0], 'jpeg');
    expect(nested.entries).toContainEqual(expect.objectContaining({ kind: 'folder', serverRelativeUrl: path + '/Scans/Forms' }));
  });
});
