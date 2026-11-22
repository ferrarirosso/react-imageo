import * as React from 'react';
import { DefaultButton, IconButton, MessageBar, MessageBarType, PrimaryButton, Spinner, Stack, Text, TextField } from '@fluentui/react';
import * as strings from 'ImageoApplicationCustomizerStrings';
import { BackendError, IImageServiceResponse, IToast } from '../../models/IContracts';
import { describeGenerateError, getImageServiceResponse } from '../../utils/generateErrors';
import { Toasts } from '../Toasts';
import { InstructionSuggestion, RequestSuggestion } from './InstructionSuggestion';
import { StudioIcon } from './StudioIcon';
import { studio } from './studioStyles';
import { checkerboard, EditorColourPicker, ICropRect, ISelectionCanvas, SelectionCanvas } from './SelectionCanvas';
import { additionalScope, applyBatch, EditKind, IEditStep, instructionPrefix, modelInstruction, needsSelection, queueStep, RequestRefine, suggestionActions, syncResize, usesModel } from './editorBatch';
import { IOutputSize, IResizeTarget, resolveResizeTarget, validOutputSize } from './canvasEdits';
import { drawSelectionPreview } from './selectionPreview';

export interface IAssistedEditorProps {
  sourceBase64: string;
  sourceName: string;
  locale?: string;
  onRefine: RequestRefine;
  onSuggest?: RequestSuggestion;
  pageBrief?: string;
  onSaveCopy: (imageBase64: string, description: string) => Promise<void>;
  onClose: () => void;
}

const actions: { kind: Exclude<EditKind, 'resize'>; label: string }[] = [
  { kind: 'remove', label: strings.EditorRemove },
  { kind: 'recolour', label: strings.EditorRecolour },
  { kind: 'transparent', label: strings.EditorTransparent },
  { kind: 'solid', label: strings.EditorSolid },
  { kind: 'scene', label: strings.EditorScene },
  { kind: 'crop', label: strings.EditorCrop }
];

const groups: { label: string; kinds: EditKind[] }[] = [
  { label: strings.StudioObject, kinds: ['remove', 'recolour'] },
  { label: strings.StudioBackground, kinds: ['transparent', 'solid', 'scene'] },
  { label: strings.StudioImage, kinds: ['crop'] }
];

interface IVersion { base64: string; description: string; saved?: boolean; original?: boolean; }
interface IQueuedSelection { mask: HTMLCanvasElement; source: HTMLCanvasElement; revision: number; }

function QueuedSelectionPreview({ mask, source, revision }: IQueuedSelection): React.ReactElement {
  const preview = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    if (preview.current) drawSelectionPreview(preview.current, mask, source, true);
  }, [mask, source, revision]);
  const scale = Math.min(128 / mask.width, 76 / mask.height);
  return <figure className={studio.queuePreview}>
    <canvas ref={preview} role="img" aria-label={strings.EditorQueuedPreview}
      style={{ ...checkerboard, display: 'block', width: Math.max(1, Math.round(mask.width * scale)),
        height: Math.max(1, Math.round(mask.height * scale)) }} />
    <figcaption>{strings.EditorSelectedArea}</figcaption>
  </figure>;
}

const regions = { inside: strings.EditorInside, outside: strings.EditorOutside };
const hexColour = /^#?[0-9a-f]{6}$/i;

function InstructionRow({ text, removeLabel, disabled, onRemove }: {
  text: string; removeLabel: string; disabled: boolean; onRemove: () => void;
}): React.ReactElement {
  return <li className={studio.instruction}>
    <span>{text}</span>
    <button type="button" aria-label={removeLabel} title={removeLabel} disabled={disabled} onClick={onRemove}>
      <span aria-hidden="true">×</span>
    </button>
  </li>;
}

const gaps = { childrenGap: 8 };

export const AssistedEditor: React.FC<IAssistedEditorProps> = ({ sourceBase64, sourceName, locale, onRefine, onSuggest, pageBrief, onSaveCopy, onClose }) => {
  const [versions, setVersions] = React.useState<IVersion[]>([{ base64: sourceBase64, description: sourceName, original: true }]);
  const current = versions[versions.length - 1];
  const [group, setGroup] = React.useState(groups[0]);
  const [action, setAction] = React.useState<EditKind>();
  const [lastColour, setLastColour] = React.useState('#237D62');
  const [sampling, setSampling] = React.useState(false);
  const [additional, setAdditional] = React.useState('');
  const [aspect, setAspect] = React.useState(16 / 9);
  const [steps, setSteps] = React.useState<IEditStep[]>([]);
  const [selection, setSelection] = React.useState<IQueuedSelection>();
  const [selected, setSelected] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [sourceSize, setSourceSize] = React.useState<IOutputSize>();
  const [compare, setCompare] = React.useState(false);
  const [busy, setBusy] = React.useState<'send' | 'save'>();
  const [issue, setIssue] = React.useState<IToast>();
  function setError(message: string, serviceResponse?: IImageServiceResponse): void {
    setIssue(message ? { id: 'editor', kind: 'error', message, serviceResponse } : undefined);
  }
  const [discardPrompt, setDiscardPrompt] = React.useState(false);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const instructions = React.useRef<HTMLElement>(null);
  const returnToRow = React.useRef<number>();
  const resultHint = React.useRef<HTMLParagraphElement>(null);
  const focusResult = React.useRef(false);
  const canvas = React.useRef<ISelectionCanvas>(null);
  const active = React.useRef(false);
  const mounted = React.useRef(true);
  const nextId = React.useRef(0);
  React.useEffect(() => {
    mounted.current = true;
    heading.current?.focus({ preventScroll: true });
    return () => { mounted.current = false; };
  }, []);
  React.useLayoutEffect(() => {
    if (focusResult.current && resultHint.current) {
      resultHint.current.focus();
      focusResult.current = false;
    }
  }, [current]);
  React.useLayoutEffect(() => {
    const index = returnToRow.current;
    if (index === undefined || !instructions.current) return;
    const buttons = instructions.current.querySelectorAll<HTMLButtonElement>('li button');
    const next = buttons[Math.min(index, buttons.length - 1)] || instructions.current.querySelector('textarea');
    next?.focus();
    returnToRow.current = undefined;
  }, [steps]);

  const activeStep = steps.find(step => step.kind === action);
  const needsColour = action === 'solid' || action === 'recolour';
  const colour = activeStep?.colour || lastColour;
  const hexText = activeStep?.hexText ?? colour;
  const model = steps.filter(step => usesModel(step.kind));
  const local = steps.filter(step => !usesModel(step.kind));
  const outputBase = local.find(step => step.kind === 'crop')?.crop || sourceSize;
  const outputTarget = local.find(step => step.kind === 'resize')?.resize;
  const validResize = !outputTarget || validOutputSize(outputTarget.width, outputTarget.height);
  const scope = additionalScope(model);
  const additionalHint = scope === 'scene' ? strings.EditorAdditionalOutside :
    scope === 'recolour' ? strings.EditorAdditionalInside : strings.EditorAdditionalOrder;
  const prompt = modelInstruction(steps, additional, regions);
  const hasDraft = !!(steps.length || additional.trim());
  const requiresMask = steps.some(step => needsSelection(step.kind));
  const promptTooLong = prompt.length > 4000;
  const canSend = ready && hasDraft && !promptTooLong && validResize && (!requiresMask || selected) &&
    !sampling && steps.every(step => !!step.instruction.trim() && (step.kind !== 'crop' || !!step.crop) &&
      (step.hexText === undefined || hexColour.test(step.hexText)));
  const edited = !current.original;

  function choose(kind: EditKind): void {
    setAction(kind);
    setError('');
    setDiscardPrompt(false);
    if (steps.some(step => step.kind === kind)) return;
    const step: IEditStep = { id: ++nextId.current, kind, instruction: '' };
    switch (kind) {
      case 'remove': step.instruction = strings.EditorRemovePrompt; break;
      case 'recolour':
        step.colour = lastColour;
        step.instruction = strings.EditorRecolourPrompt.replace('{0}', lastColour);
        break;
      case 'transparent': step.instruction = strings.EditorTransparent; break;
      case 'solid':
        step.colour = lastColour;
        step.instruction = strings.EditorSolid + ' · ' + lastColour;
        break;
      case 'crop': step.instruction = strings.EditorCrop; break;
    }
    setSteps(prev => queueStep(prev, step));
  }

  function chooseColour(hex: string): void {
    setLastColour(hex);
    if (!needsColour) return;
    const instruction = action === 'solid' ? strings.EditorSolid + ' · ' + hex : strings.EditorRecolourPrompt.replace('{0}', hex);
    setSteps(prev => prev.map(step => step.kind === action ? { ...step, colour: hex, hexText: hex, instruction } : step));
  }

  function changeScene(scene: string): void {
    const instruction = scene.trim() ? strings.EditorScenePrompt.replace('{0}', () => scene.trim()) : '';
    setSteps(prev => prev.map(step => step.kind === 'scene' ? { ...step, scene, instruction } : step));
  }

  const canvasReady = React.useCallback((loaded: boolean): void => {
    setReady(loaded);
    const source = loaded ? canvas.current?.source() : undefined;
    setSourceSize(source ? { width: source.width, height: source.height } : undefined);
  }, []);

  function queueResize(width: number, height: number, anchor?: IResizeTarget['anchor']): void {
    if (!outputBase || !sourceSize || !ready || active.current) return;
    const resize = resolveResizeTarget({ width, height, anchor }, outputBase);
    if (!validOutputSize(resize.width, resize.height)) {
      setError(strings.EditorResizeInvalid);
      return;
    }
    setError('');
    setDiscardPrompt(false);
    const step: IEditStep = { id: ++nextId.current, kind: 'resize', resize, instruction: strings.EditorResize };
    setSteps(prev => syncResize(queueStep(prev, step), sourceSize, strings.EditorResize));
  }

  const changeCrop = React.useCallback((crop: ICropRect): void => {
    setSteps(prev => {
      const step = prev.find(s => s.kind === 'crop');
      const old = step?.crop;
      if (!step || (old && old.x === crop.x && old.y === crop.y && old.width === crop.width && old.height === crop.height)) return prev;
      const instruction = strings.EditorCrop + ' · ' + crop.width + ' × ' + crop.height;
      const updated = prev.map(s => s === step ? { ...step, crop, instruction } : s);
      return syncResize(updated, sourceSize || crop, strings.EditorResize);
    });
  }, [sourceSize]);

  const changeMask = React.useCallback((mask: HTMLCanvasElement, source: HTMLCanvasElement): void => {
    // The canvas owns the live mask. Use its revision to repaint the small preview after a brush stroke.
    setSelection(prev => ({ mask, source, revision: (prev?.revision || 0) + 1 }));
  }, []);

  function removeStep(step: IEditStep): void {
    returnToRow.current = steps.indexOf(step);
    setSteps(prev => {
      const remaining = prev.filter(s => s.id !== step.id);
      return sourceSize ? syncResize(remaining, sourceSize, strings.EditorResize) : remaining;
    });
    if (step.kind === action) setAction(undefined);
    setError('');
  }

  function finishOperation(): void {
    active.current = false;
    if (mounted.current) setBusy(undefined);
  }

  function clearSelection(): void {
    setSelection(undefined);
    canvas.current?.clearSelection();
  }

  async function send(): Promise<void> {
    if (active.current || !canvas.current || !canSend) return;
    active.current = true;
    setBusy('send');
    setError('');
    setDiscardPrompt(false);
    try {
      const mask = requiresMask ? canvas.current.mask() : undefined;
      const base64 = await applyBatch(current.base64, canvas.current.source(), mask, steps, onRefine,
        strings.EditorAlignmentError, strings.EditorDecodeError, additional, regions);
      if (!mounted.current) return;
      const description = [...model.map(step => step.instruction), additional.trim(), ...local.map(step => step.instruction)]
        .filter(Boolean).join(' ');
      focusResult.current = true;
      // Retain a bounded, contiguous undo history; comparison always uses the original.
      setVersions(prev => [...prev.slice(-7), { base64, description }]);
      setSteps([]);
      setAdditional('');
      setAction(undefined);
      setCompare(false);
      clearSelection();
    } catch (err) {
      if (mounted.current) {
        if (err instanceof BackendError) {
          const detail = getImageServiceResponse(err);
          const info = describeGenerateError(err, detail);
          const title = info.kind === 'unknown' ? strings.RefineFailed : info.title;
          setError([title, info.body].filter(Boolean).join(' — '), detail);
        } else {
          setError(err instanceof Error ? err.message : strings.RefineFailed);
        }
      }
    } finally {
      finishOperation();
    }
  }

  async function save(): Promise<void> {
    if (active.current || current.saved || !edited || hasDraft) return;
    active.current = true;
    setBusy('save');
    setError('');
    try {
      await onSaveCopy(current.base64, current.description);
      if (mounted.current) setVersions(prev => prev.map(version => version === current ? { ...version, saved: true } : version));
    } catch {
      if (mounted.current) setError(strings.EditorSaveError);
    } finally {
      finishOperation();
    }
  }

  function undo(): void {
    if (active.current || hasDraft || versions.length < 2) return;
    setVersions(prev => prev.slice(0, -1));
    canvas.current?.clearSelection();
    setCompare(false);
    setError('');
    setDiscardPrompt(false);
  }

  const comparisonCaption = React.useId();
  let colourHint = strings.EditorColourTarget;
  if (sampling) colourHint = strings.EditorColourSampleHint;
  else if (!hexColour.test(hexText)) colourHint = strings.EditorColourInvalid;
  else if (selected) colourHint = strings.EditorColourReady.replace('{0}', colour);

  function row(step: IEditStep, index: number, browser: boolean): JSX.Element {
    const prefix = browser ? (index + 1) + '. ' : instructionPrefix(step.kind, index, regions);
    const removeLabel = (browser ? strings.EditorRemoveLocal : strings.EditorRemoveStep).replace('{0}', String(index + 1));
    const text = step.hexText !== undefined && !hexColour.test(step.hexText) ? strings.EditorColourInvalid : step.instruction || strings.EditorDescribeScene;
    return <InstructionRow key={step.id} text={prefix + text}
      removeLabel={removeLabel} disabled={!!busy} onRemove={() => removeStep(step)} />;
  }
  return (
    <Stack tokens={{ childrenGap: 12 }} role="region" aria-label={strings.EditorTitle}>
      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 9 }}>
        <IconButton onRenderIcon={() => <StudioIcon name="back" size={19} />} ariaLabel={strings.FinderBack} title={strings.FinderBack}
          styles={{ root: { borderRadius: 8, background: '#f2f1f6', color: '#474158' } }} disabled={!!busy}
          onClick={() => { if (hasDraft || (edited && !current.saved)) setDiscardPrompt(true); else onClose(); }} />
        <div style={{ minWidth: 0 }}>
          <h2 ref={heading} tabIndex={-1} style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 600 }}>{strings.EditorTitle}</h2>
          <div className={studio.fileName} title={sourceName}>{sourceName}</div>
        </div>
      </Stack>
      {discardPrompt && <MessageBar messageBarType={MessageBarType.warning}>
        {strings.EditorDiscardPrompt}{' '}
        <DefaultButton text={strings.Discard} onClick={onClose} />
        <DefaultButton text={strings.CancelButton} onClick={() => setDiscardPrompt(false)} />
      </MessageBar>}
      <div hidden={compare}>
        <SelectionCanvas ref={canvas} src={'data:image/png;base64,' + current.base64} locale={locale} disabled={!!busy || compare}
          cropAspect={action === 'crop' ? aspect : undefined} onSelectionChange={setSelected}
          onMaskChange={changeMask} onCropChange={action === 'crop' ? changeCrop : undefined}
          onResize={queueResize} resizeBase={outputBase} resizeTarget={outputTarget}
          allowSampling={needsColour} onSamplingChange={setSampling}
          onReady={canvasReady} onColourChange={chooseColour} onError={setError} />
      </div>
      {compare && <figure style={{ margin: 0 }}>
        <figcaption id={comparisonCaption}>{strings.EditorOriginal}</figcaption>
        <img alt={sourceName} aria-describedby={comparisonCaption} src={'data:image/png;base64,' + sourceBase64}
          style={{ ...checkerboard, display: 'block', maxWidth: '100%', maxHeight: '55vh', margin: 'auto' }} />
      </figure>}
      {edited && <div>
        {!hasDraft && <p className={studio.guidance} ref={resultHint} tabIndex={-1} role="status">
          {current.saved ? strings.EditorCopySaved : compare ? strings.EditorCompareHint : strings.EditorReviewHint}
        </p>}
        <Stack horizontal wrap tokens={gaps}>
        <DefaultButton checked={compare} text={compare ? strings.EditorShowResult : strings.EditorCompare}
          disabled={!!busy} onClick={() => setCompare(!compare)} />
        <DefaultButton text={strings.EditorUndo} disabled={!!busy || hasDraft || versions.length < 2} onClick={undo} />
        <PrimaryButton text={current.saved ? strings.ResultsSavedOk : strings.EditorSaveCopy} disabled={!!busy || hasDraft || current.saved || compare}
          onClick={save} />
        </Stack>
      </div>}
      {!compare && <>
        <section className={studio.inspector} aria-label={strings.EditorActions}>
          <div className={studio.groups} role="group" aria-label={strings.EditorActions}>
            {groups.map(item => <button key={item.label} type="button" className={studio.group} disabled={!!busy}
              aria-pressed={item === group} onClick={() => { if (item !== group) { setGroup(item); setAction(undefined); } }}>{item.label}</button>)}
          </div>
          <div className={studio.actions} role="group" aria-label={group.label}>
            {actions.filter(item => group.kinds.includes(item.kind)).map(item => <button key={item.kind} type="button"
              className={studio.action} aria-pressed={action === item.kind} disabled={!!busy} onClick={() => choose(item.kind)}>
              <StudioIcon name={item.kind} />{item.label}
            </button>)}
          </div>
        {needsColour && <EditorColourPicker value={colour} onChange={chooseColour} recolour={action === 'recolour'} hexText={hexText}
          onHexTextChange={text => setSteps(prev => prev.map(step => step.kind === action ? { ...step, hexText: text } : step))}
          onPick={() => canvas.current?.pickColour()} disabled={!!busy || !ready} locale={locale} />}
        {action === 'recolour' && <DefaultButton text={strings.EditorChooseTarget} onRenderIcon={() => <StudioIcon name="select" size={16} />}
          disabled={!ready || !!busy} onClick={() => canvas.current?.selectObject()} styles={{ root: { alignSelf: 'flex-start', borderRadius: 6 } }} />}
        {action === 'scene' && <TextField label={strings.EditorDescribeScene} multiline rows={2} value={activeStep?.scene || ''}
          maxLength={3800} disabled={!!busy} onChange={(_, text) => changeScene(text || '')} />}
        {action === 'crop' && <Stack horizontal wrap tokens={gaps}>
          <DefaultButton text={strings.EditorCropWide} checked={aspect !== 1} disabled={!!busy} onClick={() => setAspect(16 / 9)} />
          <DefaultButton text={strings.EditorCropSquare} checked={aspect === 1} disabled={!!busy} onClick={() => setAspect(1)} />
        </Stack>}
        {action === 'recolour' && <p className={studio.guidance} role="status">{colourHint}</p>}
        </section>

        <section ref={instructions} className={studio.instructions} aria-label={strings.EditorQueue}>
          <div className={studio.queueHeader}>
            <h3>{strings.EditorQueue}</h3>
            {requiresMask && selected && selection && <QueuedSelectionPreview {...selection} />}
          </div>
          {!!model.length && <ol className={studio.instructionList}>{model.map((step, i) => row(step, i, false))}</ol>}
          {!!local.length && <>
            <h4>{strings.EditorLocalActions}</h4>
            {!!prompt && <Text variant="small">{strings.EditorLocalAfter}</Text>}
            <ol className={studio.instructionList}>{local.map((step, i) => row(step, i, true))}</ol>
            {!validResize && <Text role="status" variant="small">{strings.EditorResizeInvalid}</Text>}
          </>}
          <TextField multiline autoAdjustHeight rows={2} label={strings.EditorAdditional}
            description={additional.trim() ? additionalHint.replace('{0}', String(model.length + 1)) : undefined}
            maxLength={4000} value={additional} disabled={!!busy} onChange={(_, text) => setAdditional(text || '')} />
          {onSuggest && <InstructionSuggestion brief={additional} actions={suggestionActions(steps, regions)}
            pageBrief={pageBrief} disabled={!!busy} request={onSuggest} onAccept={setAdditional} />}
          {requiresMask && !selected && <Text role="status" variant="small">{strings.EditorSelectionNeeded}</Text>}
          {promptTooLong && <Text role="alert">{strings.EditorTooLong}</Text>}
          {hasDraft && <Text variant="small">{prompt ? strings.EditorSendHint : strings.EditorLocalHint}</Text>}
          <PrimaryButton text={prompt || !hasDraft ? strings.EditorSend : strings.EditorApplyLocal}
            disabled={!!busy || !canSend} onClick={send} styles={{ root: { alignSelf: 'flex-start', borderRadius: 6 } }} />
        </section>
      </>}
      {busy && <Spinner label={busy === 'send' ? strings.RefiningCta : strings.EditorSaving} />}
      {issue && <Toasts toasts={[issue]} onDismiss={() => setIssue(undefined)} />}
    </Stack>
  );
};
