import * as React from 'react';
import { Panel as FluentPanel, PanelType, Stack } from '@fluentui/react';
import { accent, fg } from '../utils/designTokens';
import * as strings from 'ImageoApplicationCustomizerStrings';
import { ApplicationCustomizerContext } from '@microsoft/sp-application-base';
import { ThemeProvider } from '@microsoft/sp-component-base';
import { BackendClient } from '../services/BackendClient';
import { BrandSlang } from '../services/BrandSlang';
import { PageAnalyzer } from '../services/PageAnalyzer';
import { AssetsUploader } from '../services/AssetsUploader';
import { saveLastGeneration, loadLastGeneration, clearLastGeneration, sweepExpired } from '../services/LastGenerationDB';
import { getPanelWidth, setPanelWidth, PANEL_WIDTH_MIN, PANEL_WIDTH_MAX } from '../services/PanelPrefs';
import { StudioIcon } from './editor/StudioIcon';
import { studio } from './editor/studioStyles';
import {
  BackendError, IGenerateRequest, IPageSection, IPageVisualContext,
  IPalette, IToast, PageLayoutType,
} from '../models/IContracts';
import { Composer, IComposerState } from './Composer';
import { ResultsGrid, ISlotState, ApplyingTarget } from './ResultsGrid';
import { Toasts } from './Toasts';
import { ImageoMark, ImageoWordmark } from './Logo';
import { logger } from '../utils/logger';
import { describeGenerateError, getImageServiceResponse } from '../utils/generateErrors';
import { IImageoEndpoints } from '../utils/env';
import { EditorAssetFinder } from './EditorAssetFinder';
import { AssistedEditor } from './editor/AssistedEditor';

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
  const [refreshKey, setRefreshKey] = React.useState(0);
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
    size: '1024x1024',
    transparentBackground: false,
    selectedSectionIds: [],
    analyzeOn: false,
    extracting: false,
  }));

  // Only offer a summary the author requested for the current selection during this session.
  const [distilledSelection, setDistilledSelection] = React.useState<string>();
  const [slots, setSlots] = React.useState<ISlotState[]>([]);
  const [section, setSection] = React.useState<'gallery' | 'generate'>('gallery');
  const [editSource, setEditSource] = React.useState<{ name: string; imageBase64: string }>();
  const showGallery = section === 'gallery' && !editSource;
  const galleryHost = React.useRef<HTMLDivElement>(null);
  const createButton = React.useRef<HTMLButtonElement>(null);
  const returningFromEditor = React.useRef(false);
  React.useLayoutEffect(() => {
    if (!returningFromEditor.current || editSource) return;
    returningFromEditor.current = false;
    const host = galleryHost.current;
    const target = showGallery && host
      ? host.querySelector<HTMLElement>('[aria-busy] button[aria-pressed="true"]') || host.querySelector<HTMLInputElement>('input')
      : createButton.current;
    target?.focus({ preventScroll: true });
  }, [editSource, showGallery]);
  const [toasts, setToasts] = React.useState<IToast[]>([]);
  const busy = slots.some((slot) => slot.status === 'pending');
  const [refining, setRefining] = React.useState(false);
  const [applyingTarget, setApplyingTarget] = React.useState<ApplyingTarget>(undefined);
  const [justCompleted, setJustCompleted] = React.useState<ApplyingTarget>(undefined);

  const flashCompleted = React.useCallback((target: ApplyingTarget) => {
    setJustCompleted(target);
    window.setTimeout(() => setJustCompleted(undefined), 2000);
  }, []);

  const userLogin = ctx.pageContext.user.loginName || '';
  const webId = ctx.pageContext.web.id?.toString();
  const listId = ctx.pageContext.list?.id?.toString();
  const itemId = ctx.pageContext.listItem?.id;
  const pageKey = webId && listId && itemId && userLogin ? `${webId}/${listId}/${itemId}` : undefined;
  const operation = React.useRef<AbortController>();
  const imageRevision = React.useRef(0);
  const preview = React.useRef<string>();

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

  function openEditor(source: { name: string; imageBase64: string }): void {
    setToasts((previous) => previous.filter((toast) => !toast.clearOnNextImage));
    setEditSource(source);
  }

  React.useEffect(() => {
    if (!open || !pageKey) return;
    if (slots.length > 0) return;  // don't clobber a fresh in-panel generation
    const revision = imageRevision.current;
    let cancelled = false;
    (async () => {
      await sweepExpired();
      if (cancelled) return;
      const last = await loadLastGeneration(pageKey, userLogin);
      if (cancelled || !last) return;
      const b64 = await blobToB64(last.blob);
      if (cancelled || revision !== imageRevision.current) return;
      const previewUrl = URL.createObjectURL(last.blob);
      const request: IGenerateRequest = last.request || { prompt: last.prompt, size: '1024x1024', n: 1 };
      preview.current = previewUrl;
      setSlots([{
        id: `restored-${last.createdAt}`,
        status: 'ok',
        b64,
        previewUrl,
        request,
        pageContext: { essence: last.essence, chips: last.chips, selectedSectionIds: last.selectedSectionIds },
        editInstruction: last.editInstruction,
        model: last.model,
        restoredFromCreatedAt: last.createdAt,
      }]);
      setState((s) => ({
        ...s,
        prompt: request.prompt,
        size: request.size,
        transparentBackground: !!request.transparentBackground,
        brandSlang: last.request ? request.brandSlang || '' : s.brandSlang,
        essence: last.essence,
        chips: last.chips,
        selectedSectionIds: last.selectedSectionIds || [],
        analyzeOn: last.essence ? true : s.analyzeOn,
      }));
      pushToast({ kind: 'info', message: strings.ToastRestored });
    })().catch(() => { /* restore is best-effort */ });
    return () => { cancelled = true; };
  }, [open, pageKey, userLogin]);

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
    if (!open) {
      setSlots((prev) => prev.filter((slot) => slot.status !== 'pending'));
      setRefining(false);
    }
    return () => {
      operation.current?.abort();
      operation.current = undefined;
    };
  }, [open]);

  React.useEffect(() => () => {
    if (preview.current) URL.revokeObjectURL(preview.current);
  }, []);

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
      setDistilledSelection(JSON.stringify(picked.map(item => item.id)));
      setState((s) => ({ ...s, extracting: false, essence: res.essence, chips: res.chips, prompt: res.suggestedPrompt }));
    } catch (err) {
      const msg = err instanceof BackendError ? err.message : (err as Error).message;
      setState((s) => ({ ...s, extracting: false }));
      pushToast({ kind: 'error', message: strings.ToastExtractFailed.replace('{0}', msg), stickyUntilDismiss: true });
    }
  }, [backend, pageTitle, chosenSections, sections.length, palette, pageLayout, pushToast]);

  async function runImage(slot: ISlotState, edit?: { imageBase64: string; instruction: string }): Promise<boolean> {
    if (operation.current) return false;
    const controller = new AbortController();
    operation.current = controller;
    imageRevision.current++;
    setToasts((prev) => prev.filter((toast) => !toast.clearOnNextImage));
    if (edit) {
      setRefining(true);
    } else {
      setSlots([{ ...slot, status: 'pending', error: undefined }]);
    }

    try {
      const image = edit
        ? (await backend.refine(edit, controller.signal)).image
        : (await backend.generate(slot.request, controller.signal)).images?.[0];
      if (controller.signal.aborted) return false;
      if (!image?.b64) throw new BackendError('No image returned', 502, 'empty_response');
      const blob = b64ToBlob(image.b64);
      const previewUrl = URL.createObjectURL(blob);
      if (preview.current) URL.revokeObjectURL(preview.current);
      preview.current = previewUrl;
      setSlots([{
        ...slot, status: 'ok', b64: image.b64, previewUrl, model: image.model,
        editInstruction: edit?.instruction, restoredFromCreatedAt: undefined, error: undefined,
      }]);
      pushToast({
        kind: 'success',
        message: edit ? strings.RefinedToast : strings.ToastGenerated.replace('{0}', '1'),
        clearOnNextImage: true,
      });
      if (pageKey) {
        await saveLastGeneration(pageKey, userLogin, {
          blob, prompt: slot.request.prompt, request: slot.request, model: image.model,
          editInstruction: edit?.instruction, ...slot.pageContext, createdAt: Date.now(),
        });
      }
      return true;
    } catch (err) {
      if (controller.signal.aborted) return false;
      const serviceResponse = getImageServiceResponse(err as BackendError);
      const info = describeGenerateError(err as BackendError, serviceResponse);
      const title = edit && info.kind === 'unknown' ? strings.RefineFailed : info.title;
      setSlots([slot.b64 ? slot : { ...slot, status: 'error', error: title }]);
      pushToast({
        kind: info.kind === 'quota' ? 'warning' : 'error',
        message: info.body ? `${title} — ${info.body}` : title,
        stickyUntilDismiss: true,
        clearOnNextImage: true,
        serviceResponse,
      });
      return false;
    } finally {
      if (operation.current === controller) {
        operation.current = undefined;
        setRefining(false);
      }
    }
  }

  function runGenerate(): void {
    if (!state.prompt.trim() || operation.current) return;
    const request: IGenerateRequest = {
      prompt: state.prompt, brandSlang: state.brandSlang, n: 1, size: state.size,
      ...(state.transparentBackground ? { transparentBackground: true } : {}),
    };
    runImage({
      id: makeId(), status: 'pending', request,
      pageContext: { essence: state.essence, chips: state.chips, selectedSectionIds: state.selectedSectionIds },
    }).catch((err) => logger.warn('Generation failed', err));
  }

  function refineSlot(slot: ISlotState, instruction: string): Promise<boolean> {
    if (!slot.b64 || !instruction.trim()) return Promise.resolve(false);
    return runImage(slot, { imageBase64: slot.b64, instruction: instruction.trim() });
  }

  async function refineInEditor(imageBase64: string, instruction: string, guideBase64?: string): Promise<string> {
    if (operation.current) throw new Error(strings.RefiningCta);
    const controller = new AbortController();
    operation.current = controller;
    setToasts((previous) => previous.filter((toast) => !toast.clearOnNextImage));
    try {
      const { image } = await backend.refine({ imageBase64, instruction, guideBase64 }, controller.signal);
      if (!image?.b64) throw new Error(strings.RefineFailed);
      return image.b64;
    } finally {
      if (operation.current === controller) operation.current = undefined;
    }
  }

  const discardSlot = React.useCallback((slot: ISlotState) => {
    if (operation.current) return;
    imageRevision.current++;
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = undefined;
    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    if (pageKey) {
      clearLastGeneration(pageKey, userLogin).catch(() => { /* noop */ });
    }
  }, [pageKey, userLogin]);

  const saveImageCopy = React.useCallback(async (imageBase64: string, description: string, model?: string) => {
    const up = await uploader.uploadImage(imageBase64, description, {
      prompt: description,
      model,
    });
    pushToast({
      kind: 'success',
      message: strings.ToastSaved,
      action: { label: strings.ToastOpenInLibrary, href: up.libraryUrl },
    });
    logger.log('Saved to assets', up.serverRelativeUrl);
    flashCompleted('assets');
    setRefreshKey(previous => previous + 1);
  }, [uploader, pushToast, flashCompleted]);

  const saveSlotToAssets = React.useCallback(async (slot: ISlotState) => {
    if (!slot.b64 || applyingTarget) return;
    setApplyingTarget('assets');
    try {
      await saveImageCopy(slot.b64, slot.editInstruction || slot.request.prompt, slot.model);
    } catch (err) {
      const msg = (err as Error).message;
      pushToast({ kind: 'error', message: `Save failed: ${msg}`, stickyUntilDismiss: true });
    } finally {
      setApplyingTarget(undefined);
    }
  }, [saveImageCopy, pushToast, applyingTarget]);

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
    <div className={studio.header}>
      <ImageoMark size={34} />
      <div><ImageoWordmark size={18} />
        <div style={{ fontSize: 12, color: fg.secondary }}>{strings.PanelSubtitleFull}</div>
      </div>
    </div>
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
            right: `calc(min(100vw, ${panelWidth}px) - 12px)`,
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
      isHiddenOnDismiss={!!editSource}
      onDismiss={onDismiss}
      type={PanelType.custom}
      customWidth={`min(100vw, ${panelWidth}px)`}
      hasCloseButton={true}
      closeButtonAriaLabel={strings.Close}
      onRenderHeader={onRenderHeader}
      popupProps={{ ariaLabel: 'Imageo' }}
      styles={{
        main: resizing ? { transition: 'none' } : {},
        navigation: { alignItems: 'center' },
        commands: { paddingTop: 0, flexShrink: 0 },
        scrollableContent: { flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: showGallery ? 'hidden' : 'auto',
          selectors: { '@media (max-height: 410px)': { overflowY: 'auto' } } },
        content: { display: 'flex', flexDirection: 'column', gap: 10, flex: showGallery ? '1 1 0' : '1 0 auto',
          minHeight: showGallery ? 0 : 'auto', padding: '0 18px',
          selectors: { '@media (max-height: 410px)': { minHeight: showGallery ? 340 : 'auto', flexShrink: 0 } } }
      }}
    >
      {!editSource && <nav className={studio.navigation} aria-label="Imageo">
        <button type="button" className={studio.navButton} aria-pressed={section === 'gallery'} onClick={() => setSection('gallery')}>
          <StudioIcon name="gallery" size={16} />{strings.StudioGallery}
        </button>
        <button type="button" ref={createButton} className={studio.navButton} aria-pressed={section === 'generate'} onClick={() => setSection('generate')}>
          <StudioIcon name="create" size={17} />{strings.StudioCreate}
        </button>
      </nav>}
      <div ref={galleryHost} hidden={!showGallery} style={{ display: showGallery ? 'flex' : 'none', flexDirection: 'column', flex: '1 1 0', minHeight: 0 }}>
        <EditorAssetFinder context={ctx} onSelect={source => { if (galleryHost.current && !galleryHost.current.hidden) openEditor(source); }} refreshKey={refreshKey} disabled={busy || refining || !!applyingTarget} />
      </div>
      {editSource && <AssistedEditor sourceBase64={editSource.imageBase64} sourceName={editSource.name}
        locale={ctx.pageContext.cultureInfo.currentUICultureName} onRefine={refineInEditor}
        pageBrief={state.analyzeOn && distilledSelection === JSON.stringify(chosenSections().map(item => item.id))
          ? state.essence : undefined}
        onSuggest={open ? (request, signal) => backend.suggestInstruction(request, signal) : undefined}
        onSaveCopy={saveImageCopy} onClose={() => { returningFromEditor.current = true; setEditSource(undefined); }} />}
      {!editSource && section === 'generate' && <Stack tokens={{ childrenGap: 12 }}>
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
            refining={refining}
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
            refining={refining}
            onRefine={refineSlot}
            onOpenEditor={(slot) => { if (slot.b64) openEditor({ imageBase64: slot.b64, name: strings.GeneratedEditorSource }); }}
            onRetry={(slot) => { runImage(slot).catch((err) => logger.warn('Retry failed', err)); }}
          />

      </Stack>}
      {(showGallery || !!editSource) && <Toasts toasts={toasts} onDismiss={dismissToast} />}
      <footer className={studio.footer}>
        <span>Microsoft Foundry{slots[0]?.model && <> · {slots[0].model}</>}</span>
        <a href={strings.FooterLinkHref} target="_blank" rel="noopener noreferrer" data-interception="off"
          style={{ color: accent[700] }}>{strings.FooterLinkLabel} ↗</a>
      </footer>
    </FluentPanel>
    </>
  );
};
