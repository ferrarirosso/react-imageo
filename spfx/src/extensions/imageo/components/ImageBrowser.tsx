import * as React from 'react';
import {
  Stack, Spinner, IconButton, PrimaryButton, DefaultButton, Text, Label, Separator,
  Dialog, DialogType, DialogFooter,
} from '@fluentui/react';
import * as strings from 'ImageoApplicationCustomizerStrings';
import { AssetsBrowser } from '../services/AssetsBrowser';
import { IBrowserTile } from '../models/IContracts';

export interface IImageBrowserProps {
  browser: AssetsBrowser;
  onCopyImage: (tile: IBrowserTile) => void;
  onCopyUrl: (tile: IBrowserTile) => void;
}

export interface IImageBrowserHandle {
  reload: () => Promise<void>;
}

const PAGE_SIZE = 20;
const SCROLL_THRESHOLD = 120;

interface IBrowserTileProps {
  tile: IBrowserTile;
  thumbUrl: string;
  onOpen: (tile: IBrowserTile) => void;
  onCopyImage: (tile: IBrowserTile) => void;
  onCopyUrl: (tile: IBrowserTile) => void;
}

const BrowserTile: React.FC<IBrowserTileProps> = ({ tile, thumbUrl, onOpen, onCopyImage, onCopyUrl }) => {
  const [imgError, setImgError] = React.useState(false);
  const label = tile.title && tile.title !== 'imageo-generated' ? tile.title : tile.name;
  return (
    <Stack
      styles={{
        root: {
          border: '1px solid #edebe9',
          borderRadius: 4,
          overflow: 'hidden',
          background: '#fff',
        },
      }}
    >
      <button
        type="button"
        onClick={() => onOpen(tile)}
        title={label}
        aria-label={`Preview ${label}`}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'block',
          width: '100%',
          aspectRatio: '1 / 1',
          background: '#f3f2f1',
        }}
      >
        {!imgError ? (
          <img
            src={thumbUrl}
            alt={label}
            loading="lazy"
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <Stack
            horizontalAlign="center"
            verticalAlign="center"
            styles={{ root: { height: '100%' } }}
          >
            <Text variant="small" styles={{ root: { color: '#a19f9d' } }}>
              No preview
            </Text>
          </Stack>
        )}
      </button>
      <Stack
        horizontal
        tokens={{ childrenGap: 0 }}
        styles={{ root: { padding: 4, background: '#faf9f8', borderTop: '1px solid #edebe9' } }}
      >
        <IconButton
          iconProps={{ iconName: 'Copy' }}
          title="Copy image to clipboard"
          ariaLabel="Copy image"
          onClick={() => onCopyImage(tile)}
          styles={{ root: { flex: 1 } }}
        />
        <IconButton
          iconProps={{ iconName: 'Link' }}
          title="Copy URL"
          ariaLabel="Copy URL"
          onClick={() => onCopyUrl(tile)}
          styles={{ root: { flex: 1 } }}
        />
      </Stack>
      <Text
        variant="small"
        styles={{
          root: {
            padding: '4px 6px',
            color: '#605e5c',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        }}
        title={label}
      >
        {label}
      </Text>
    </Stack>
  );
};

export const ImageBrowser = React.forwardRef<IImageBrowserHandle, IImageBrowserProps>(
  ({ browser, onCopyImage, onCopyUrl }, ref) => {
    const [tiles, setTiles] = React.useState<IBrowserTile[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [hasMore, setHasMore] = React.useState(true);
    const [initialized, setInitialized] = React.useState(false);
    const [preview, setPreview] = React.useState<IBrowserTile | undefined>();

    const loadMore = React.useCallback(async (skip: number, replace: boolean) => {
      setLoading(true);
      try {
        const batch = await browser.listRecent(PAGE_SIZE, skip);
        setHasMore(batch.length === PAGE_SIZE);
        setTiles((prev) => replace ? batch : [...prev, ...batch]);
      } finally {
        setLoading(false);
      }
    }, [browser]);

    const reload = React.useCallback(async () => {
      await loadMore(0, true);
    }, [loadMore]);

    React.useImperativeHandle(ref, () => ({ reload }), [reload]);

    React.useEffect(() => {
      if (initialized) return;
      setInitialized(true);
      loadMore(0, true).catch(() => { /* best-effort */ });
    }, [initialized, loadMore]);

    const onScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (loading || !hasMore) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD) {
        loadMore(tiles.length, false).catch(() => { /* best-effort */ });
      }
    }, [loading, hasMore, tiles.length, loadMore]);

    const openPreview = React.useCallback((tile: IBrowserTile) => setPreview(tile), []);
    const closePreview = React.useCallback(() => setPreview(undefined), []);

    const handleCopyImage = React.useCallback((tile: IBrowserTile) => {
      onCopyImage(tile);
      setPreview(undefined);
    }, [onCopyImage]);

    const handleCopyUrl = React.useCallback((tile: IBrowserTile) => {
      onCopyUrl(tile);
      setPreview(undefined);
    }, [onCopyUrl]);

    return (
      <Stack tokens={{ childrenGap: 8 }}>
        <Separator />
        <Label>{strings.LibraryHeading}</Label>

        {tiles.length === 0 && !loading && (
          <Text variant="small" styles={{ root: { color: '#605e5c' } }}>
            {/* Safe: LibraryEmptyHtml is a static localized string from our own
                loc bundle (contains a <strong> tag), never user input. */}
            <span dangerouslySetInnerHTML={{ __html: strings.LibraryEmptyHtml }} />
          </Text>
        )}

        {tiles.length > 0 && (
          <div
            onScroll={onScroll}
            style={{
              maxHeight: 360,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
              }}
            >
              {tiles.map((tile) => (
                <BrowserTile
                  key={tile.serverRelativeUrl}
                  tile={tile}
                  thumbUrl={browser.thumbnailUrl(tile.serverRelativeUrl)}
                  onOpen={openPreview}
                  onCopyImage={onCopyImage}
                  onCopyUrl={onCopyUrl}
                />
              ))}
            </div>
            {loading && (
              <Stack horizontalAlign="center" styles={{ root: { padding: 8 } }}>
                <Spinner label="Loading more…" />
              </Stack>
            )}
          </div>
        )}

        {tiles.length === 0 && loading && <Spinner label="Reading library…" />}

        {preview && (
          <Dialog
            hidden={false}
            onDismiss={closePreview}
            dialogContentProps={{
              type: DialogType.normal,
              title: preview.title && preview.title !== 'imageo-generated'
                ? 'Image preview'
                : preview.name,
              showCloseButton: true,
            }}
            modalProps={{ isBlocking: false }}
            minWidth={420}
            maxWidth={720}
          >
            <Stack tokens={{ childrenGap: 12 }}>
              <img
                src={preview.serverRelativeUrl}
                alt={preview.title || preview.name}
                style={{ width: '100%', height: 'auto', borderRadius: 4, display: 'block' }}
              />
              {preview.title && preview.title !== 'imageo-generated' && (
                <Text variant="small" styles={{ root: { color: '#605e5c', fontStyle: 'italic' } }}>
                  <strong>Prompt: </strong>{preview.title}
                </Text>
              )}
              <Text variant="small" styles={{ root: { color: '#a19f9d' } }}>
                {preview.name}
              </Text>
            </Stack>
            <DialogFooter>
              <PrimaryButton
                iconProps={{ iconName: 'Copy' }}
                text="Copy image"
                onClick={() => handleCopyImage(preview)}
              />
              <DefaultButton
                iconProps={{ iconName: 'Link' }}
                text="Copy URL"
                onClick={() => handleCopyUrl(preview)}
              />
              <DefaultButton text="Close" onClick={closePreview} />
            </DialogFooter>
          </Dialog>
        )}
      </Stack>
    );
  }
);

ImageBrowser.displayName = 'ImageBrowser';
