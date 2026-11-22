import * as React from 'react';
import {
  ActionButton, DefaultButton, Dialog, DialogFooter, Dropdown, Icon, IconButton, IDropdownOption,
  mergeStyleSets, MessageBar, MessageBarType, PrimaryButton, SearchBox, Spinner, Stack, Text,
} from '@fluentui/react';
import { ApplicationCustomizerContext } from '@microsoft/sp-application-base';
import * as strings from 'ImageoApplicationCustomizerStrings';
import {
  EditorAssets, GalleryFileType, IEditorAsset, IFinderEntry, IFinderPage, IGallerySort, IOpenedImage, prepareEditorAsset,
} from '../services/EditorAssets';
import { accent, bg, border, fg, radius } from '../utils/designTokens';

interface IFinderProps {
  context: ApplicationCustomizerContext;
  onSelect: (asset: IEditorAsset) => void;
  refreshKey?: number;
  disabled?: boolean;
}

interface ISortOption extends IDropdownOption {
  key: string;
  sort: IGallerySort;
}

const sortOptions: ISortOption[] = [
  { key: 'modified-desc', text: strings.GalleryModifiedNewest, sort: { field: 'modified', descending: true } },
  { key: 'modified-asc', text: strings.GalleryModifiedOldest, sort: { field: 'modified', descending: false } },
  { key: 'created-desc', text: strings.GalleryCreatedNewest, sort: { field: 'created', descending: true } },
  { key: 'created-asc', text: strings.GalleryCreatedOldest, sort: { field: 'created', descending: false } },
  { key: 'creator-asc', text: strings.GalleryCreatorAZ, sort: { field: 'creator', descending: false } },
  { key: 'creator-desc', text: strings.GalleryCreatorZA, sort: { field: 'creator', descending: true } },
];

const fileTypes: IDropdownOption[] = [
  { key: 'all', text: strings.GalleryAllFileTypes },
  { key: 'png', text: 'PNG' },
  { key: 'jpeg', text: 'JPEG' },
];

const ellipsis: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const gap = 10;
const classes = mergeStyleSets({
  card: {
    position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0,
    border: '1px solid ' + border.default, borderRadius: radius.md, overflow: 'hidden', padding: 0,
    font: 'inherit', textAlign: 'start', cursor: 'pointer', background: bg.panel, color: fg.primary,
    selectors: {
      ':hover:enabled': { borderColor: accent[400] },
      ':focus-visible': { outline: '2px solid ' + accent[600], outlineOffset: 1 },
      '&[aria-pressed=true]': { background: accent[50], borderColor: accent[600], boxShadow: 'inset 0 0 0 1px ' + accent[600] },
      '@media (forced-colors: active)': { selectors: { '&[aria-pressed=true]': { outline: '2px solid Highlight', outlineOffset: -3 } } },
      ':disabled': { cursor: 'default' },
    },
  },
});

function useGridSize(compact: boolean): { grid: React.RefObject<HTMLDivElement>; columns: number; rows: number } {
  const grid = React.useRef<HTMLDivElement>(null);
  const [layout, setLayout] = React.useState({ columns: 2, rows: 1 });
  React.useLayoutEffect(() => {
    const node = grid.current;
    if (!node) return;
    function measure(): void {
      if (!node || !node.clientWidth || !node.clientHeight) return;
      const columns = Math.max(1, Math.floor((node.clientWidth + gap) / (152 + gap)));
      const rows = Math.max(1, Math.floor((node.clientHeight + gap) / ((compact ? 66 : 148) + gap)));
      setLayout(prev => prev.columns === columns && prev.rows === rows ? prev : { columns, rows });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [compact]);
  return { grid, ...layout };
}

function dateLabel(value: string | undefined, format: Intl.DateTimeFormat): string {
  if (!value) return '';
  const time = Date.parse(value);
  return Number.isFinite(time) ? format.format(time) : '';
}

const GalleryEntry: React.FC<{
  entry: IFinderEntry; assets: EditorAssets; checked: boolean; disabled: boolean;
  modified: boolean; dateFormat: Intl.DateTimeFormat; onClick: () => void;
}> = ({ entry, assets, checked, disabled, modified, dateFormat, onClick }) => {
  const [thumbnailFailed, setThumbnailFailed] = React.useState(false);
  const file = entry.kind === 'image';
  const timestamp = modified ? entry.modified : entry.created;
  const date = dateLabel(timestamp, dateFormat);
  const dateType = modified ? strings.GalleryModified : strings.GalleryCreated;
  const details = [entry.creator && strings.GalleryCreator + ' ' + entry.creator, date && dateType + ' ' + date]
    .filter(Boolean).join(', ');
  const folder = entry.serverRelativeUrl.slice(0, entry.serverRelativeUrl.lastIndexOf('/'));
  return (
    <button type="button" className={classes.card} aria-label={entry.name} aria-description={details || undefined} title={entry.serverRelativeUrl}
      aria-pressed={file ? checked : undefined} disabled={disabled} onClick={onClick}>
      {file && <span style={{ display: 'grid', placeItems: 'center', flex: '1 1 0', minHeight: 0, width: '100%', overflow: 'hidden', background: bg.page }}>
        {thumbnailFailed ? <Icon iconName="Photo2" aria-hidden="true" styles={{ root: { color: fg.tertiary, fontSize: 24 } }} /> :
          <img src={assets.thumbnail(entry.serverRelativeUrl)} alt="" loading="lazy" onError={() => setThumbnailFailed(true)}
            style={{ width: '100%', height: '100%', minHeight: 0, objectFit: 'contain' }} />}
      </span>}
      {file && checked && <span aria-hidden="true" style={{
        position: 'absolute', right: 6, top: 6, width: 22, height: 22, borderRadius: '50%',
        display: 'grid', placeItems: 'center', background: accent[600], color: fg.inverted,
        border: '2px solid white', boxSizing: 'border-box', fontSize: 11,
      }}><Icon iconName="CheckMark" /></span>}
      <span style={{ display: 'grid', alignContent: 'center', flex: file ? 'none' : '1 1 auto', padding: '6px 9px 7px', gap: 2, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
        <span style={{ ...ellipsis, fontWeight: 600, fontSize: 13 }}>
          {!file && <Icon iconName="FabricFolder" aria-hidden="true" styles={{ root: { marginInlineEnd: 6, color: accent[600] } }} />}
          {entry.name}
        </span>
        {file && <span style={{ ...ellipsis, color: fg.secondary, fontSize: 12 }} title={entry.creator ? strings.GalleryCreator + ' · ' + entry.creator : folder}>
          {entry.creator || folder}
        </span>}
        {file && date && <time dateTime={timestamp} style={{ ...ellipsis, color: fg.secondary, fontSize: 11 }}>
          {dateType + ' · ' + date}
        </time>}
      </span>
    </button>
  );
};

function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  if (message === strings.FinderDenied || message === strings.FinderMissing || message === strings.FinderInvalid ||
      message.startsWith(strings.FinderFailure)) return message;
  const status = (err as { status?: number } | undefined)?.status;
  return status === 401 || status === 403 ? strings.FinderDenied : strings.FinderFailure;
}

export const EditorAssetFinder: React.FC<IFinderProps> = ({ context, onSelect, refreshKey, disabled = false }) => {
  const assets = React.useMemo(() => new EditorAssets(context), [context]);
  const locale = context.pageContext.cultureInfo?.currentUICultureName;
  const dateFormat = React.useMemo(() => new Intl.DateTimeFormat(locale || undefined,
    { day: 'numeric', month: 'short', year: 'numeric' }), [locale]);
  const [browse, setBrowse] = React.useState(false);
  const [trail, setTrail] = React.useState<IFinderEntry[]>([]);
  const [input, setInput] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState(sortOptions[0]);
  const [fileType, setFileType] = React.useState<GalleryFileType>('all');
  const [refresh, setRefresh] = React.useState(0);
  const [page, setPage] = React.useState<IFinderPage & { signal?: AbortSignal }>({ entries: [] });
  const [offset, setOffset] = React.useState(0);
  const [selected, setSelected] = React.useState<IFinderEntry>();
  const [preview, setPreview] = React.useState(false);
  const [listing, setListing] = React.useState(false);
  const [working, setWorking] = React.useState<'open' | 'copy'>();
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [pending, setPending] = React.useState<IOpenedImage>();
  const listRequest = React.useRef<AbortController>();
  const fileRequest = React.useRef<AbortController>();
  const previousView = React.useRef<string>();
  const folder = trail[trail.length - 1];
  const { grid, columns, rows } = useGridSize(browse && !folder);
  const capacity = columns * rows;
  const selectedIndex = selected ? page.entries.findIndex(entry => entry.serverRelativeUrl === selected.serverRelativeUrl) : -1;
  const anchor = selectedIndex >= 0 ? selectedIndex : offset;
  const last = page.more ? Math.max(anchor, 0) : Math.max(page.entries.length - 1, 0);
  const pageIndex = Math.floor(Math.min(Math.max(0, anchor), last) / capacity);
  const start = pageIndex * capacity;
  const end = start + capacity;
  const visible = page.entries.slice(start, end);
  const pageCount = Math.max(1, Math.ceil(page.entries.length / capacity));
  const waiting = listing || (!!page.more && !visible.length && !error);
  const blocked = disabled || !!working;
  const canUse = selectedIndex >= 0 && !blocked && !listing && (browse || query === input.trim());

  // Drop the old metadata when a save, a refresh or unmount invalidates the gallery.
  React.useEffect(() => () => assets.invalidateGallery(), [assets, refresh, refreshKey]);

  React.useEffect(() => {
    if (input.trim() === query) return;
    const timer = window.setTimeout(() => setQuery(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input, query]);

  React.useEffect(() => {
    const controller = new AbortController();
    listRequest.current = controller;
    fileRequest.current?.abort();
    setWorking(undefined);
    setPending(undefined);
    const viewKey = fileType + '/' + (browse ? 'folder:' + (folder?.serverRelativeUrl || '') : sort.key + '/' + query);
    if (viewKey !== previousView.current) {
      setSelected(undefined);
      setOffset(0);
      previousView.current = viewKey;
    }
    setPreview(false);
    setError('');
    setNotice('');
    setListing(true);
    setPage({ entries: [] });
    async function list(): Promise<void> {
      try {
        const result = browse
          ? await (folder ? assets.folder(folder, fileType, controller.signal) : assets.libraries())
          : await assets.gallery(query, sort.sort, controller.signal, fileType);
        if (controller.signal.aborted) return;
        setPage({ ...result, signal: controller.signal });
        if (!result.more) setSelected(current => current && result.entries.find(entry => entry.serverRelativeUrl === current.serverRelativeUrl));
      } catch (err) {
        if (!controller.signal.aborted) setError(errorText(err));
      } finally {
        if (!controller.signal.aborted) setListing(false);
      }
    }
    list().catch(() => undefined);
    return () => { controller.abort(); fileRequest.current?.abort(); };
  }, [assets, browse, folder, query, sort, fileType, refresh, refreshKey]);

  React.useEffect(() => {
    if (!page.more || page.signal?.aborted || error || page.entries.length > end) return;
    let current = true;
    page.more().then(next => {
      if (!current || page.signal?.aborted) return;
      const seen = new Set(page.entries.map(entry => entry.serverRelativeUrl.toLowerCase()));
      const entries = next.entries.filter(entry => !seen.has(entry.serverRelativeUrl.toLowerCase()));
      setPage({ entries: page.entries.concat(entries), more: next.more, signal: page.signal });
    }).catch(err => { if (current && !page.signal?.aborted) setError(errorText(err)); });
    return () => { current = false; };
  }, [end, page, error]);

  function goTo(next: number): void {
    setOffset(next * capacity);
    setSelected(undefined);
    setPending(undefined);
    setError('');
    setNotice('');
  }

  function select(entry: IFinderEntry): void {
    setError('');
    setNotice('');
    setPending(undefined);
    if (entry.kind === 'image') {
      setOffset(start);
      setSelected(entry.serverRelativeUrl === selected?.serverRelativeUrl ? undefined : entry);
    } else {
      setTrail(prev => prev.concat(entry));
    }
  }

  async function refine(ready?: IOpenedImage): Promise<void> {
    if (!selected || !canUse || (fileRequest.current && !fileRequest.current.signal.aborted)) return;
    const controller = new AbortController();
    fileRequest.current = controller;
    setPending(undefined);
    setError('');
    setNotice('');
    setWorking('open');
    try {
      const opened = ready || await assets.open(selected, controller.signal);
      if (controller.signal.aborted) return;
      if (!ready && (opened.targetWidth !== opened.image.naturalWidth || opened.targetHeight !== opened.image.naturalHeight)) {
        setPending(opened);
        return;
      }
      const image = await prepareEditorAsset(selected, opened, !!ready);
      if (!controller.signal.aborted) { setPreview(false); onSelect(image); }
    } catch (err) {
      if (!controller.signal.aborted) setError(errorText(err));
    } finally {
      if (!controller.signal.aborted) setWorking(undefined);
      controller.abort();
    }
  }

  async function copy(image: boolean): Promise<void> {
    if (!selected || !canUse) return;
    const controller = listRequest.current;
    setWorking('copy');
    setError('');
    setNotice('');
    try {
      if (image) await assets.copyImage(selected); else await assets.copyLink(selected);
      if (!controller?.signal.aborted) setNotice(image ? strings.ResultsCopiedOk : strings.ToastUrlCopied);
    } catch {
      if (!controller?.signal.aborted) setError(image ? strings.ToastImageCopyFail : strings.GalleryCopyLinkFailed);
    } finally {
      if (!controller?.signal.aborted) setWorking(undefined);
    }
  }

  function changeView(next: boolean): void {
    setBrowse(next);
    setTrail([]);
    setInput('');
    setQuery('');
  }

  const tool = (name: string, icon: string, handler: () => void): JSX.Element =>
    <IconButton ariaLabel={name} title={name} iconProps={{ iconName: icon }} disabled={!canUse} onClick={handler} />;

  return (
    <div role="region" aria-label={strings.GalleryTitle} style={{
      display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: 0, minWidth: 0, gap: 9,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2,
          padding: 3, background: bg.page, borderRadius: radius.md }}>
          {[{ active: !browse, text: strings.GalleryAll, icon: 'PhotoCollection', next: false },
            { active: browse, text: strings.FinderBrowse, icon: 'FabricFolder', next: true }].map(tab =>
            <DefaultButton key={tab.text} text={tab.text} iconProps={{ iconName: tab.icon }} toggle checked={tab.active}
              disabled={blocked} onClick={() => { if (!tab.active) changeView(tab.next); }}
              styles={{ root: { minWidth: 0, padding: '0 10px', border: 0, borderRadius: radius.sm, background: 'transparent' },
                rootChecked: { background: bg.panel, color: accent[700], boxShadow: '0 1px 3px rgba(0,0,0,.1)' },
                icon: { fontSize: 14 } }} />)}
        </div>
        <IconButton ariaLabel={strings.FinderReload} title={strings.FinderReload} iconProps={{ iconName: 'Refresh' }}
          disabled={blocked || listing} onClick={() => setRefresh(value => value + 1)} />
      </div>
      {!browse && <SearchBox ariaLabel={strings.GallerySearch} placeholder={strings.GallerySearch}
          value={input} disabled={blocked} onChange={(_, value) => setInput(value || '')}
          onSearch={value => setQuery(value.trim())}
          styles={{ root: { flexShrink: 0, minWidth: 0, borderRadius: radius.sm } }} />}
      {(!browse || folder) && <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
        <Dropdown label={strings.GalleryFileType} selectedKey={fileType}
          styles={{ root: { flex: '1 1 0', minWidth: 0 }, title: { borderRadius: radius.sm } }}
          options={fileTypes} disabled={blocked} onChange={(_, value) => { if (value) setFileType(value.key as GalleryFileType); }} />
        {!browse && <Dropdown label={strings.GallerySort} selectedKey={sort.key}
          styles={{ root: { flex: '1 1 0', minWidth: 0 }, title: { borderRadius: radius.sm } }}
          options={sortOptions} disabled={blocked} onChange={(_, value) => { if (value) setSort(value as ISortOption); }} />}
      </div>}
      {browse && folder && <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
        <ActionButton iconProps={{ iconName: 'Back' }} text={strings.FinderBack} disabled={blocked}
          onClick={() => setTrail(prev => prev.slice(0, -1))} />
        <Text variant="small" title={folder.serverRelativeUrl} style={{ ...ellipsis, minWidth: 0 }}>{folder.serverRelativeUrl}</Text>
      </Stack>}
      {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError('')}>{error}</MessageBar>}
      <div ref={grid} aria-busy={waiting} style={{ flex: '1 1 0', minHeight: browse && !folder ? 66 : 138,
        position: 'relative', display: 'grid', gap, gridTemplateColumns: 'repeat(' + columns + ', minmax(0, 1fr))',
        gridTemplateRows: 'repeat(' + rows + ', minmax(0, 1fr))' }}>
        {visible.map(entry => <GalleryEntry key={entry.serverRelativeUrl} entry={entry} assets={assets}
          checked={entry.serverRelativeUrl === selected?.serverRelativeUrl} disabled={blocked}
          modified={browse || sort.sort.field === 'modified'} dateFormat={dateFormat} onClick={() => select(entry)} />)}
        {!visible.length && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center',
          padding: 14, textAlign: 'center', background: bg.subtle, border: '1px dashed ' + border.default, borderRadius: radius.md }}>
          {waiting ? <Spinner label={strings.FinderLoading} /> :
            !error && <Text>{fileType !== 'all' && (!browse || folder) ? strings.GalleryFileTypeEmpty.replace('{0}', fileType.toUpperCase())
              : browse ? strings.FinderEmpty : strings.GalleryEmpty}</Text>}
        </div>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
        gap: 5, borderTop: '1px solid ' + border.default, paddingTop: 6 }}>
        <Stack horizontal verticalAlign="center">
          <IconButton ariaLabel={strings.GalleryPrev} title={strings.GalleryPrev} iconProps={{ iconName: 'ChevronLeft' }}
            disabled={blocked || listing || !pageIndex} onClick={() => goTo(pageIndex - 1)} />
          <Text role="status" variant="small" styles={{ root: { color: fg.secondary, whiteSpace: 'nowrap' } }}>
            {(page.more ? strings.GalleryPage : strings.GalleryPageOf).replace('{0}', String(pageIndex + 1)).replace('{1}', String(pageCount))}
          </Text>
          <IconButton ariaLabel={strings.GalleryNext} title={strings.GalleryNext} iconProps={{ iconName: 'ChevronRight' }}
            disabled={blocked || waiting || end >= page.entries.length} onClick={() => goTo(pageIndex + 1)} />
        </Stack>
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 2 }}>
          {tool(strings.GalleryPreview, 'View', () => setPreview(true))}
          {tool(strings.GalleryCopyImage, 'Copy', () => { copy(true).catch(() => undefined); })}
          {tool(strings.GalleryCopyLink, 'Link', () => { copy(false).catch(() => undefined); })}
          <PrimaryButton text={strings.RefineCta} iconProps={{ iconName: 'EditPhoto' }} disabled={!canUse || !!pending}
            styles={{ root: { borderRadius: radius.sm, marginInlineStart: 4 } }}
            onClick={() => { refine().catch(() => undefined); }} />
        </Stack>
      </div>
      {working === 'open' && <Spinner label={strings.FinderOpening} />}
      {notice && <Text role="status" variant="small">{notice}</Text>}
      {pending && selected && <MessageBar messageBarType={MessageBarType.warning} onDismiss={() => setPending(undefined)}>
        <p>{strings.FinderResize.replace('{0}', () => selected.name)
          .replace('{1}', pending.image.naturalWidth + ' × ' + pending.image.naturalHeight)
          .replace('{2}', pending.targetWidth + ' × ' + pending.targetHeight)}</p>
        <PrimaryButton text={strings.FinderResizeOpen} disabled={!canUse} onClick={() => { refine(pending).catch(() => undefined); }} />
      </MessageBar>}
      {preview && selected && <Dialog hidden={false} onDismiss={() => setPreview(false)}
        dialogContentProps={{ title: selected.name, showCloseButton: true, closeButtonAriaLabel: strings.Close }}
        modalProps={{ isBlocking: false }} maxWidth={720}>
        <Stack tokens={{ childrenGap: 6 }}>
          <img src={assets.contentUrl(selected.serverRelativeUrl)} alt={selected.name}
            style={{ width: '100%', maxHeight: '55vh', objectFit: 'contain' }} />
          {selected.title && selected.title !== selected.name && selected.title !== 'imageo-generated' && <Text>{selected.title}</Text>}
          {selected.creator && <Text>{strings.GalleryCreator + ' · ' + selected.creator}</Text>}
          {selected.created && <Text>{strings.GalleryCreated + ' · ' + dateLabel(selected.created, dateFormat)}</Text>}
          {selected.modified && <Text>{strings.GalleryModified + ' · ' + dateLabel(selected.modified, dateFormat)}</Text>}
          <Text variant="small" styles={{ root: { overflowWrap: 'anywhere' } }}>{selected.serverRelativeUrl}</Text>
        </Stack>
        <DialogFooter>
          <DefaultButton text={strings.GalleryCopyImage} disabled={!canUse} onClick={() => { setPreview(false); copy(true).catch(() => undefined); }} />
          <DefaultButton text={strings.GalleryCopyLink} disabled={!canUse} onClick={() => { setPreview(false); copy(false).catch(() => undefined); }} />
          <DefaultButton text={strings.Close} onClick={() => setPreview(false)} />
        </DialogFooter>
      </Dialog>}
    </div>
  );
};
