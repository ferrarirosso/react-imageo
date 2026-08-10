import * as React from 'react';
import { Panel as FluentPanel, PanelType, Stack, Text, Separator } from '@fluentui/react';
import { accent, fg } from '../utils/designTokens';
import * as strings from 'ImageoApplicationCustomizerStrings';
import { ApplicationCustomizerContext } from '@microsoft/sp-application-base';
import { ThemeProvider } from '@microsoft/sp-component-base';
import { BackendClient } from '../services/BackendClient';
import { BrandSlang } from '../services/BrandSlang';
import { PageAnalyzer } from '../services/PageAnalyzer';
import { AssetsUploader } from '../services/AssetsUploader';
import { AssetsBrowser } from '../services/AssetsBrowser';
import { saveLastGeneration, loadLastGeneration, clearLastGeneration, sweepExpired } from '../services/LastGenerationDB';
import { getPanelWidth, setPanelWidth, PANEL_WIDTH_MIN, PANEL_WIDTH_MAX } from '../services/PanelPrefs';
import { ImageBrowser, IImageBrowserHandle } from './ImageBrowser';
import { IBrowserTile } from '../models/IContracts';
import {
  BackendError, IGeneratedImage, IPageSection, IPageVisualContext,
  IPalette, IToast, PageLayoutType,
} from '../models/IContracts';
import { Composer, IComposerState } from './Composer';
import { ResultsGrid, ISlotState, ApplyingTarget } from './ResultsGrid';
import { Toasts } from './Toasts';
import { ImageoMark, ImageoWordmark } from './Logo';
import { logger } from '../utils/logger';
import { describeGenerateError } from '../utils/generateErrors';
import { IImageoEndpoints } from '../utils/env';

export interface IPanelProps {
  open: boolean;
  onDismiss: () => void;
  ctx: ApplicationCustomizerContext;
  endpoints: IImageoEndpoints;
}

function makeId(): string {
  return `id-${Math.random().toString(36).slice(2, 10)}`;
}

function b64ToBlob(b64: string, type = 'image/png'): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function b64ToObjectUrl(b64: string): string {
  return URL.createObjectURL(b64ToBlob(b64));
}

async function blobToB64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export const Panel: React.FC<IPanelProps> = ({ open, onDismiss, ctx, endpoints }) => {
  const backend = React.useMemo(() => new BackendClient(ctx.aadHttpClientFactory, endpoints), [ctx, endpoints]);
  const uploader = React.useMemo(() => new AssetsUploader(ctx), [ctx]);
  const assetsBrowser = React.useMemo(() => new AssetsBrowser(ctx), [ctx]);
  const browserRef = React.useRef<IImageBrowserHandle>(null);
  const brandSlangStore = React.useMemo(() => {
    const host = ctx.pageContext.web.absoluteUrl.replace(/^https?:\/\//, '').split('/')[0];
    const login = ctx.pageContext.user.loginName || '';
    return new BrandSlang(host, login);
  }, [ctx]);

  const [panelWidth, setWidth] = React.useState<number>(() => getPanelWidth());
  const panelWidthRef = React.useRef<number>(panelWidth);
  panelWidthRef.current = panelWidth;
  const [resizing, setResizing] = React.useState(false);

  const startResize = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    try { target.setPointerCapture(pointerId); } catch { /* older browsers */ }
    const startX = e.clientX;
    const startW = panelWidthRef.current;
    setResizing(true);
    const onMove = (ev: PointerEvent): void => {
      const dx = startX - ev.clientX;
      const next = Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, startW + dx));
      setWidth(next);
    };
    const finish = (): void => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', finish);
      try { target.releasePointerCapture(pointerId); } catch { /* noop */ }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setResizing(false);
      setPanelWidth(panelWidthRef.current);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const [pageTitle, setPageTitle] = React.useState('');
  const [sections, setSections] = React.useState<IPageSection[]>([]);
  const [pageLayout, setPageLayout] = React.useState<{
    layoutType: PageLayoutType; hasHeroImage: boolean; hasCanvasHero: boolean;
  }>({ layoutType: 'Unknown', hasHeroImage: false, hasCanvasHero: false });
  const [mapLoading, setMapLoading] = React.useState(false);
  const [mapError, setMapError] = React.useState<string | undefined>();

  const palette = React.useMemo<IPalette | undefined>(() => {
    try {
      const tp = ctx.serviceScope.consume(ThemeProvider.serviceKey);
      const theme = tp?.tryGetTheme();
      const p = theme?.palette;
      if (!p) return undefined;
      return {
        primary: p.themePrimary,
        secondary: p.themeSecondary,
        accent: p.accent,
        background: p.white,
        text: p.neutralPrimary,
      };
    } catch {
      return undefined;
    }
  }, [ctx]);

  const [state, setState] = React.useState<IComposerState>(() => ({
    prompt: '',
    brandSlang: brandSlangStore.get(),
    n: 1,
    selectedSectionIds: [],
    analyzeOn: false,
    extracting: false,
  }));

  const [slots, setSlots] = React.useState<ISlotState[]>([]);
  const [toasts, setToasts] = React.useState<IToast[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [applyingTarget, setApplyingTarget] = React.useState<ApplyingTarget>(undefined);
  const [justCompleted, setJustCompleted] = React.useState<ApplyingTarget>(undefined);

  const flashCompleted = React.useCallback((target: ApplyingTarget) => {
    setJustCompleted(target);
    window.setTimeout(() => setJustCompleted(undefined), 2000);
  }, []);

  const pageIdForPersist = ctx.pageContext.listItem?.id;
  const userLogin = ctx.pageContext.user.loginName || '';
  const abortersRef = React.useRef<Map<string, AbortController>>(new Map());

  const pushToast = React.useCallback((t: Omit<IToast, 'id'>) => {
    const toast: IToast = { id: makeId(), ...t };
    setToasts((prev) => [...prev, toast]);
    if (!t.stickyUntilDismiss && t.kind !== 'error') {
      window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== toast.id)), 6000);
    }
  }, []);

  const dismissToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  React.useEffect(() => {
    if (!open || !pageIdForPersist) return;
    if (slots.length > 0) return;  // don't clobber a fresh in-panel generation
    let cancelled = false;
    (async () => {
      await sweepExpired();
      if (cancelled) return;
      const last = await loadLastGeneration(pageIdForPersist, userLogin);
      if (cancelled || !last) return;
      const b64 = await blobToB64(last.blob);
      if (cancelled) return;
      const previewUrl = URL.createObjectURL(last.blob);
      setSlots([{
        id: `restored-${last.createdAt}`,
        status: 'ok',
        b64,
        previewUrl,
        prompt: last.prompt,
        restoredFromCreatedAt: last.createdAt,
      }]);
      setState((s) => ({
        ...s,
        prompt: last.prompt,
        essence: last.essence,
        chips: last.chips,
        selectedSectionIds: last.selectedSectionIds || [],
        analyzeOn: last.essence ? true : s.analyzeOn,
      }));
      pushToast({ kind: 'info', message: strings.ToastRestored });
    })().catch(() => { /* restore is best-effort */ });
    return () => { cancelled = true; };
  }, [open, pageIdForPersist, userLogin]);

  React.useEffect(() => {
    if (!open) return;
    const pageId = ctx.pageContext.listItem?.id;
    if (!pageId) { setMapError('No page id available for analysis.'); return; }
    setMapLoading(true);
    setMapError(undefined);
    const analyzer = new PageAnalyzer(ctx.spHttpClient, ctx.pageContext.web.absoluteUrl, pageId);
    analyzer
      .extractSections()
      .then(({ pageTitle: t, sections: secs, layout }) => {
        setPageTitle(t || 'Page');
        setSections(secs);
        setPageLayout(layout);
      })
      .catch((err) => {
        logger.warn('Scrape failed', err);
        setMapError(`Could not analyze page: ${(err as Error).message}`);
      })
      .finally(() => setMapLoading(false));
    // Default-select every section so publishers see a populated picker
    // the first time they turn the toggle on.
  }, [open, ctx]);

  React.useEffect(() => {
    setState((s) => {
      if (s.selectedSectionIds.length > 0) return s;
      if (sections.length === 0) return s;
      return { ...s, selectedSectionIds: sections.map((sec) => sec.id) };
    });
  }, [sections]);

  React.useEffect(() => {
    if (open) return;
    abortersRef.current.forEach((a) => a.abort());
    abortersRef.current.clear();
  }, [open]);

  const onSaveBrandSlang = React.useCallback(() => {
    brandSlangStore.set(state.brandSlang);
  }, [brandSlangStore, state.brandSlang]);

  const chosenSections = React.useCallback((): IPageSection[] => {
    if (state.selectedSectionIds.length === 0) return sections;
    return sections.filter((s) => state.selectedSectionIds.includes(s.id));
  }, [sections, state.selectedSectionIds]);

  const runExtract = React.useCallback(async () => {
    setState((s) => ({ ...s, extracting: true, essence: undefined, chips: undefined }));
    try {
      const picked = chosenSections();
      const scopeKind: 'page' | 'section' = picked.length === sections.length ? 'page' : 'section';
      const heroSignal = pageLayout.hasHeroImage || pageLayout.hasCanvasHero;
      const pageContext: IPageVisualContext | undefined = (palette || pageLayout.layoutType !== 'Unknown' || heroSignal)
        ? { palette, layoutType: pageLayout.layoutType, hasHeroImage: heroSignal }
        : undefined;
      const res = await backend.distill({
        scope: scopeKind,
        pageTitle,
        sections: picked,
        pageContext,
        locale: ctx.pageContext.cultureInfo.currentCultureName,
      });
      setState((s) => ({ ...s, extracting: false, essence: res.essence, chips: res.chips, prompt: res.suggestedPrompt }));
    } catch (err) {
      const msg = err instanceof BackendError ? err.message : (err as Error).message;
      setState((s) => ({ ...s, extracting: false }));
      pushToast({ kind: 'error', message: strings.ToastExtractFailed.replace('{0}', msg), stickyUntilDismiss: true });
    }
  }, [backend, pageTitle, chosenSections, sections.length, palette, pageLayout, pushToast]);

  const runGenerate = React.useCallback(async () => {
    if (!state.prompt.trim()) return;

    slots.forEach((s) => s.previewUrl && URL.revokeObjectURL(s.previewUrl));
    abortersRef.current.forEach((a) => a.abort());
    abortersRef.current.clear();

    const slot: ISlotState = { id: makeId(), status: 'pending' };
    setSlots([slot]);
    setBusy(true);

    const controller = new AbortController();
    abortersRef.current.set(slot.id, controller);
    try {
      const res = await backend.generate(
        { prompt: state.prompt, brandSlang: state.brandSlang, n: 1, size: '1024x1024' },
        controller.signal
      );
      const first: IGeneratedImage | undefined = res.images?.[0];
      if (!first) throw new BackendError('No image returned', 502, 'empty_response');
      const blob = b64ToBlob(first.b64);
      const previewUrl = URL.createObjectURL(blob);
      setSlots([{ ...slot, status: 'ok', b64: first.b64, previewUrl, prompt: state.prompt, model: first.model }]);
      pushToast({ kind: 'success', message: strings.ToastGenerated.replace('{0}', '1') });
      if (pageIdForPersist) {
        saveLastGeneration(pageIdForPersist, userLogin, {
          blob,
          prompt: state.prompt,
          essence: state.essence,
          chips: state.chips,
          selectedSectionIds: state.selectedSectionIds,
          createdAt: Date.now(),
        }).catch(() => { /* logged inside */ });
      }
    } catch (err) {
      const info = describeGenerateError(err as BackendError);
      setSlots([{ ...slot, status: 'error', error: info.title }]);
      pushToast({
        kind: info.kind === 'quota' ? 'warning' : 'error',
        message: info.body ? `${info.title} — ${info.body}` : info.title,
        stickyUntilDismiss: true,
      });
    } finally {
      abortersRef.current.delete(slot.id);
      setBusy(false);
    }
  }, [backend, state.prompt, state.brandSlang, slots, pushToast]);

  const retrySlot = React.useCallback(async (slot: ISlotState) => {
    setSlots((prev) => prev.map((s) => s.id === slot.id ? { ...s, status: 'pending', error: undefined } : s));
    const controller = new AbortController();
    abortersRef.current.set(slot.id, controller);
    try {
      const res = await backend.generate(
        { prompt: state.prompt, brandSlang: state.brandSlang, n: 1, size: '1024x1024' },
        controller.signal
      );
      const first = res.images?.[0];
      if (!first) throw new BackendError('No image returned', 502);
      const previewUrl = b64ToObjectUrl(first.b64);
      setSlots((prev) => prev.map((s) => s.id === slot.id ? { ...s, status: 'ok', b64: first.b64, previewUrl, model: first.model } : s));
    } catch (err) {
      const info = describeGenerateError(err as BackendError);
      setSlots((prev) => prev.map((s) => s.id === slot.id ? { ...s, status: 'error', error: info.title } : s));
      pushToast({
        kind: info.kind === 'quota' ? 'warning' : 'error',
        message: info.body ? `${info.title} — ${info.body}` : info.title,
        stickyUntilDismiss: true,
      });
    } finally {
      abortersRef.current.delete(slot.id);
    }
  }, [backend, state.prompt, state.brandSlang, pushToast]);

  const discardSlot = React.useCallback((slot: ISlotState) => {
    if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    if (pageIdForPersist) {
      clearLastGeneration(pageIdForPersist, userLogin).catch(() => { /* noop */ });
    }
  }, [pageIdForPersist, userLogin]);

  const onCopyBrowserImage = React.useCallback(async (tile: IBrowserTile) => {
    try {
      await assetsBrowser.copyImage(tile);
      pushToast({ kind: 'success', message: strings.ToastClipboardOk, stickyUntilDismiss: true });
    } catch (err) {
      logger.error('browser copy image failed', err);
      pushToast({ kind: 'error', message: strings.ToastImageCopyFail, stickyUntilDismiss: true });
    }
  }, [assetsBrowser, pushToast]);

  const onCopyBrowserUrl = React.useCallback(async (tile: IBrowserTile) => {
    try {
      await assetsBrowser.copyUrl(tile);
      pushToast({ kind: 'success', message: strings.ToastUrlCopied });
    } catch (err) {
      logger.error('browser copy url failed', err);
      pushToast({ kind: 'error', message: strings.ToastImageCopyFail });
    }
  }, [assetsBrowser, pushToast]);

  const saveSlotToAssets = React.useCallback(async (slot: ISlotState) => {
    if (!slot.b64 || applyingTarget) return;
    setApplyingTarget('assets');
    try {
      const up = await uploader.uploadImage(slot.b64, state.prompt, {
        prompt: state.prompt,
        model: slot.model || 'mai-image-2.5-flash',
      });
      const webAbs = ctx.pageContext.web.absoluteUrl.replace(/\/+$/, '');
      const folderPath = `${ctx.pageContext.web.serverRelativeUrl}/SiteAssets/AIImages`;
      const assetsUrl =
        `${webAbs}/SiteAssets/Forms/AllItems.aspx` +
        `?id=${encodeURIComponent(up.serverRelativeUrl)}` +
        `&parent=${encodeURIComponent(folderPath)}`;
      pushToast({
        kind: 'success',
        message: strings.ToastSaved,
        action: { label: strings.ToastOpenInLibrary, href: assetsUrl },
      });
      logger.log('Saved to assets', up.serverRelativeUrl);
      flashCompleted('assets');
      browserRef.current?.reload().catch(() => { /* best-effort */ });
    } catch (err) {
      const msg = (err as Error).message;
      pushToast({ kind: 'error', message: `Save failed: ${msg}`, stickyUntilDismiss: true });
    } finally {
      setApplyingTarget(undefined);
    }
  }, [uploader, ctx, state.prompt, pushToast, applyingTarget]);

  const copyToClipboard = React.useCallback(async (slot: ISlotState) => {
    if (!slot.b64 || applyingTarget) return;
    setApplyingTarget('clipboard');
    try {
      // Safari requires the Promise passed directly to ClipboardItem, no awaits.
      const blobPromise = Promise.resolve(b64ToBlob(slot.b64));
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blobPromise }),
      ]);
      flashCompleted('clipboard');
    } catch (err) {
      logger.error('clipboard write failed', err);
      pushToast({ kind: 'error', message: strings.ToastClipboardFail, stickyUntilDismiss: true });
    } finally {
      setApplyingTarget(undefined);
    }
  }, [applyingTarget, pushToast, flashCompleted]);

  const onRenderHeader = (): JSX.Element => (
    <Stack
      horizontal
      verticalAlign="start"
      tokens={{ childrenGap: 12 }}
      styles={{ root: { padding: '20px 20px 16px', flex: 1 } }}
    >
      <ImageoMark size={36} />
      <Stack.Item grow styles={{ root: { minWidth: 0 } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ImageoWordmark size={15} />
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: accent.fg,
              background: accent[50],
              padding: '2px 6px',
              borderRadius: 4,
              textTransform: 'uppercase',
            }}
          >
            {strings.PreviewBadge}
          </span>
        </div>
        <div style={{ fontSize: 12, color: fg.tertiary, marginTop: 2 }}>
          {strings.PanelSubtitleFull}
        </div>
      </Stack.Item>
    </Stack>
  );

  return (
    <>
      {open && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={strings.ResizePanelAria}
          tabIndex={0}
          onPointerDown={startResize}
          onClick={(e) => { e.stopPropagation(); }}
          onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
          onMouseEnter={(e) => {
            const grip = e.currentTarget.firstElementChild as HTMLElement | null;
            if (grip && !resizing) { grip.style.background = accent[600]; grip.style.transform = 'scaleY(1.15)'; }
          }}
          onMouseLeave={(e) => {
            const grip = e.currentTarget.firstElementChild as HTMLElement | null;
            if (grip && !resizing) { grip.style.background = '#ffffff'; grip.style.transform = 'scaleY(1)'; }
          }}
          style={{
            position: 'fixed',
            top: '50%',
            transform: 'translateY(-50%)',
            height: 96,
            right: panelWidth - 12,
            width: 24,
            cursor: 'ew-resize',
            zIndex: 2147483647,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            touchAction: 'none',
          }}
        >
          <div
            style={{
              width: 20,
              height: 56,
              borderRadius: 10,
              background: resizing ? accent[600] : '#ffffff',
              border: `1px solid ${accent[500]}`,
              boxShadow: resizing
                ? `0 0 0 3px ${accent[200]}, 0 4px 12px rgba(0,0,0,0.2)`
                : '0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)',
              transition: 'background 120ms ease, transform 120ms ease, box-shadow 120ms ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              pointerEvents: 'none',
            }}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  display: 'block',
                  width: 3,
                  height: 3,
                  borderRadius: '50%',
                  background: resizing ? '#ffffff' : accent[600],
                }}
              />
            ))}
          </div>
        </div>
      )}
    <FluentPanel
      isOpen={open}
      onDismiss={onDismiss}
      type={PanelType.custom}
      customWidth={`${panelWidth}px`}
      hasCloseButton={true}
      closeButtonAriaLabel={strings.Close}
      onRenderHeader={onRenderHeader}
      styles={resizing ? { main: { transition: 'none' } } : undefined}
    >
      <Stack tokens={{ childrenGap: 12 }} styles={{ root: { padding: '4px 20px 20px' } }}>
        <Composer
          pageTitle={pageTitle}
          sections={sections}
          mapLoading={mapLoading}
          mapError={mapError}
          state={state}
          onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
          onExtract={runExtract}
          onSaveBrandSlang={onSaveBrandSlang}
          onGenerate={runGenerate}
          busy={busy}
          palette={palette}
        />

        <Toasts toasts={toasts} onDismiss={dismissToast} />

        <ResultsGrid
          slots={slots}
          applyingTarget={applyingTarget}
          justCompleted={justCompleted}
          onCopyToClipboard={copyToClipboard}
          onSaveToAssets={saveSlotToAssets}
          onDiscard={discardSlot}
          onRetry={retrySlot}
        />

        <ImageBrowser
          ref={browserRef}
          browser={assetsBrowser}
          onCopyImage={onCopyBrowserImage}
          onCopyUrl={onCopyBrowserUrl}
        />

        <Separator />
        <Stack
          horizontal
          horizontalAlign="space-between"
          verticalAlign="center"
          styles={{ root: { paddingTop: 4, paddingBottom: 8 } }}
        >
          <Text variant="small" styles={{ root: { color: '#a19f9d' } }}>
            Powered by <strong>MAI-Image-2.5-Flash</strong> on Microsoft Foundry
          </Text>
          <a
            href={strings.FooterLinkHref}
            target="_blank"
            rel="noopener noreferrer"
            data-interception="off"
            style={{ fontSize: 12, color: '#0078d4', textDecoration: 'none' }}
          >
            {strings.FooterLinkLabel} ↗
          </a>
        </Stack>
      </Stack>
    </FluentPanel>
    </>
  );
};
