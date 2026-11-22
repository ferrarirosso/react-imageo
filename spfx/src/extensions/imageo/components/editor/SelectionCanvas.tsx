import * as React from 'react';
import { DefaultButton, TooltipHost } from '@fluentui/react';
import { keyframes, mergeStyles } from '@fluentui/react/lib/Styling';
import * as strings from 'ImageoApplicationCustomizerStrings';
import { StudioIcon } from './StudioIcon';
import { studio } from './studioStyles';
import { context2d, cropAt, ICropRect, IOutputSize, IResizeTarget, makeCanvas } from './canvasEdits';
import { ClickSegmentation } from './segmentation';
import { selectionLabels } from './selectionLabels';
import { drawSelectionPreview } from './selectionPreview';
import { ResizeImageControl } from './ResizeImageControl';

export { applyBackground, applyCrop, ICropRect } from './canvasEdits';

export interface ISelectionCanvas {
  source(): HTMLCanvasElement;
  mask(): HTMLCanvasElement;
  cropRect(): ICropRect;
  pickColour(): void;
  selectObject(): void;
  clearSelection(): void;
}

interface ISelectionCanvasProps {
  src: string;
  disabled?: boolean;
  selectionLocked?: boolean;
  allowSampling?: boolean;
  onSamplingChange?: (sampling: boolean) => void;
  onSelectionChange: (active: boolean) => void;
  onMaskChange?: (mask: HTMLCanvasElement, source: HTMLCanvasElement) => void;
  onCropChange?: (crop: ICropRect) => void;
  resizeBase?: IOutputSize;
  resizeTarget?: IResizeTarget;
  onResize: (width: number, height: number, anchor?: 'width' | 'height') => void;
  onError: (message: string) => void;
  onReady?: (ready: boolean) => void;
  onColourChange: (hex: string) => void;
  cropAspect?: number;
  locale?: string;
}

type Tool = 'select' | 'colour' | 'add' | 'erase' | 'sample';
interface Point { x: number; y: number; }
const pulse = keyframes({ '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.65 } });
const pulsingSelection = mergeStyles({
  selectors: {
    '@media (prefers-reduced-motion: no-preference)': {
      animationName: pulse, animationDuration: '2.4s', animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite',
    },
  },
});
const keyboardOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' };
export const checkerboard: React.CSSProperties = {
  backgroundColor: '#fff',
  backgroundImage: 'conic-gradient(#d7d7d7 25%, transparent 0 50%, #d7d7d7 0 75%, transparent 0)',
  backgroundSize: '16px 16px',
};

export const SelectionCanvas = React.forwardRef<ISelectionCanvas, ISelectionCanvasProps>(function SelectionCanvas(props, ref) {
  const labels = selectionLabels(props.locale);
  const callbacks = React.useRef(props);
  callbacks.current = props;
  const source = React.useRef<HTMLCanvasElement>(null);
  const overlay = React.useRef<HTMLCanvasElement>(null);
  const selection = React.useRef<HTMLCanvasElement>();
  const previewFrame = React.useRef<number>();
  const maskChanged = React.useRef(false);
  const lastCropAspect = React.useRef<number>();
  const analysis = React.useRef<{ segmenter: ClickSegmentation; width: number; height: number }>();
  const loaded = React.useRef<string>();
  const drag = React.useRef<{ id: number; point: Point }>();
  const [tool, setTool] = React.useState<Tool>('select');
  const [ready, setReady] = React.useState(false);
  const [diameter, setDiameter] = React.useState(20);
  const [hasSelection, setHasSelection] = React.useState(false);
  const [dimensions, setDimensions] = React.useState({ width: 1, height: 1 });
  const [centre, setCentre] = React.useState<Point>({ x: 0, y: 0 });
  const [cropPercent, setCropPercent] = React.useState(100);
  const [keyboardPoint, setKeyboardPoint] = React.useState<Point>();
  const refreshPreview = React.useCallback((): void => {
    if (previewFrame.current !== undefined) return;
    previewFrame.current = window.requestAnimationFrame(() => {
      previewFrame.current = undefined;
      const mask = selection.current;
      if (overlay.current && source.current && mask) drawSelectionPreview(overlay.current, mask, source.current);
      if (maskChanged.current && mask && source.current) callbacks.current.onMaskChange?.(mask, source.current);
      maskChanged.current = false;
    });
  }, []);
  const refreshSelection = (): void => {
    maskChanged.current = true;
    refreshPreview();
  };
  React.useEffect(() => {
    const observer = new ResizeObserver(refreshPreview);
    if (overlay.current) observer.observe(overlay.current);
    return () => {
      observer.disconnect();
      if (previewFrame.current !== undefined) window.cancelAnimationFrame(previewFrame.current);
      previewFrame.current = undefined;
    };
  }, [refreshPreview]);
  React.useEffect(() => {
    callbacks.current.onSamplingChange?.(tool === 'sample');
    if (tool === 'sample' && props.allowSampling === false) setTool('select');
  }, [tool, props.allowSampling]);
  const reportSelection = (active: boolean): void => {
    setHasSelection(active);
    callbacks.current.onSelectionChange(active);
  };
  const clear = (): void => {
    const layer = selection.current;
    if (layer) context2d(layer).clearRect(0, 0, layer.width, layer.height);
    refreshSelection();
    reportSelection(false);
  };

  React.useEffect(() => {
    let cancelled = false;
    const image = new Image();
    setReady(false);
    loaded.current = undefined;
    selection.current = undefined;
    maskChanged.current = false;
    lastCropAspect.current = undefined;
    if (overlay.current) context2d(overlay.current).clearRect(0, 0, overlay.current.width, overlay.current.height);
    analysis.current = undefined;
    drag.current = undefined;
    setTool('select');
    setKeyboardPoint(undefined);
    setCropPercent(100);
    setHasSelection(false);
    callbacks.current.onSelectionChange(false);
    callbacks.current.onReady?.(false);
    const fail = (): void => { if (!cancelled) callbacks.current.onError(selectionLabels(callbacks.current.locale).unavailable); };
    image.onload = () => {
      if (cancelled || !source.current || !overlay.current) return;
      try {
        const w = image.naturalWidth;
        const h = image.naturalHeight;
        // Imported files and Foundry results both pass through the same editor budget.
        if (!w || !h || w * h > 4194304) { fail(); return; }
        source.current.width = w;
        source.current.height = h;
        selection.current = makeCanvas(w, h);
        context2d(source.current).drawImage(image, 0, 0);
        loaded.current = props.src;
        setDimensions({ width: w, height: h });
        setCentre({ x: w / 2, y: h / 2 });
        setReady(true);
        callbacks.current.onReady?.(true);
      } catch { fail(); }
    };
    image.onerror = fail;
    image.src = props.src;
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [props.src]);

  React.useEffect(() => {
    drag.current = undefined;
    if (!props.cropAspect || props.cropAspect === lastCropAspect.current) return;
    lastCropAspect.current = props.cropAspect;
    setCropPercent(100);
    setCentre({ x: dimensions.width / 2, y: dimensions.height / 2 });
  }, [props.cropAspect, dimensions]);

  const crop = React.useMemo(() => cropAt(dimensions.width, dimensions.height, props.cropAspect || 1, cropPercent / 100, centre.x, centre.y),
    [dimensions, props.cropAspect, cropPercent, centre.x, centre.y]);
  React.useEffect(() => {
    if (ready && props.cropAspect) callbacks.current.onCropChange?.(crop);
  }, [ready, props.cropAspect, crop]);
  React.useImperativeHandle(ref, () => ({
    source(): HTMLCanvasElement {
      if (!source.current || loaded.current !== props.src) throw new Error(labels.unavailable);
      return source.current;
    },
    mask(): HTMLCanvasElement {
      if (!selection.current || loaded.current !== props.src) throw new Error(labels.unavailable);
      const result = makeCanvas(dimensions.width, dimensions.height);
      context2d(result).drawImage(selection.current, 0, 0);
      return result;
    },
    cropRect: () => ({ ...crop }),
    pickColour(): void {
      setTool('sample');
      source.current?.focus();
    },
    selectObject(): void {
      setTool('select');
      source.current?.focus({ preventScroll: true });
      source.current?.scrollIntoView({ block: 'center', inline: 'nearest' });
    },
    clearSelection: clear,
  }));

  function select(point: Point): void {
    if (!source.current || !selection.current) return;
    if (!analysis.current) {
      const scale = Math.min(1, 480 / Math.max(dimensions.width, dimensions.height));
      const small = makeCanvas(Math.max(1, Math.round(dimensions.width * scale)), Math.max(1, Math.round(dimensions.height * scale)));
      const ctx = context2d(small);
      ctx.drawImage(source.current, 0, 0, small.width, small.height);
      analysis.current = {
        width: small.width, height: small.height,
        segmenter: new ClickSegmentation(ctx.getImageData(0, 0, small.width, small.height)),
      };
    }
    const { width, height, segmenter } = analysis.current;
    const selected = segmenter.select(point.x * width / dimensions.width, point.y * height / dimensions.height, tool === 'select');
    if (!selected.some(Boolean)) { props.onError(labels.empty); return; }
    const scaled = makeCanvas(width, height);
    const ctx = context2d(scaled);
    const pixels = ctx.createImageData(width, height);
    for (let i = 0; i < selected.length; i++) {
      if (!selected[i]) continue;
      pixels.data.fill(255, i * 4, i * 4 + 4);
    }
    ctx.putImageData(pixels, 0, 0);
    context2d(selection.current).drawImage(scaled, 0, 0, dimensions.width, dimensions.height);
    refreshSelection();
    reportSelection(true);
  }

  function brush(from: Point, to: Point): void {
    const layer = selection.current;
    if (!layer || !source.current) return;
    const ctx = context2d(layer);
    const brushWidth = diameter * layer.width / Math.max(1, source.current.getBoundingClientRect().width);
    ctx.save();
    ctx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = 'white';
    ctx.lineWidth = brushWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (from.x === to.x && from.y === to.y) {
      ctx.arc(to.x, to.y, brushWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.restore();
    refreshSelection();
  }

  function endBrush(): void {
    if (!selection.current) return;
    if (tool === 'add') { reportSelection(true); return; }
    if (tool === 'erase') {
      const { data } = context2d(selection.current).getImageData(0, 0, dimensions.width, dimensions.height);
      let i = 3;
      while (i < data.length && data[i] === 0) i += 4;
      reportSelection(i < data.length);
    }
  }

  function sample(point: Point): void {
    if (!source.current) return;
    const { data } = context2d(source.current).getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1);
    const rgb = Array.from(data.subarray(0, 3), channel => ('0' + channel.toString(16)).slice(-2)).join('');
    props.onColourChange('#' + rgb.toUpperCase());
    setTool('select');
  }

  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(dimensions.width - 1, (e.clientX - rect.left) * dimensions.width / rect.width)),
      y: Math.max(0, Math.min(dimensions.height - 1, (e.clientY - rect.top) * dimensions.height / rect.height)),
    };
  };
  const unavailable = !ready || !!props.disabled || loaded.current !== props.src;
  const selectionDisabled = unavailable || !!props.selectionLocked;
  const isCropping = !!props.cropAspect && tool !== 'sample';
  const canvasDisabled = unavailable || (!!props.selectionLocked && !isCropping && tool !== 'sample');
  function activate(p: Point): void {
    if (unavailable) return;
    if (tool === 'sample') { sample(p); return; }
    if (isCropping) { setCentre(p); return; }
    if (selectionDisabled) return;
    if (tool === 'select' || tool === 'colour') select(p);
    else brush(p, p);
  }
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (canvasDisabled || !e.isPrimary || e.button !== 0 || drag.current) return;
    setKeyboardPoint(undefined);
    const p = pointFrom(e);
    if (isCropping || (!selectionDisabled && (tool === 'add' || tool === 'erase'))) {
      drag.current = { id: e.pointerId, point: p };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    activate(p);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const stroke = drag.current;
    if (unavailable || !stroke || stroke.id !== e.pointerId) return;
    const p = pointFrom(e);
    if (isCropping) setCentre(p);
    else if (!selectionDisabled) brush(stroke.point, p);
    stroke.point = p;
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = undefined;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!unavailable && !isCropping) endBrush();
  };
  const onKey = (e: React.KeyboardEvent<HTMLCanvasElement>): void => {
    if (canvasDisabled) return;
    const p = keyboardPoint || { x: dimensions.width / 2, y: dimensions.height / 2 };
    const step = e.shiftKey ? 1 : Math.max(1, Math.round(Math.min(dimensions.width, dimensions.height) / 40));
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate(p);
      if (!isCropping && !selectionDisabled) endBrush();
      return;
    }
    const offsets: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const delta = offsets[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = { x: Math.max(0, Math.min(dimensions.width - 1, p.x + delta.x)), y: Math.max(0, Math.min(dimensions.height - 1, p.y + delta.y)) };
    setKeyboardPoint(next);
    if (isCropping) setCentre(next);
  };
  const helpId = React.useId();
  const toolHelp = { select: labels.hint, colour: labels.colourHint, add: labels.addHint, erase: labels.eraseHint, clear: labels.clearHint };
  const hint = tool === 'sample' ? labels.sample : isCropping ? labels.moveCrop : toolHelp[tool];
  const activeLabel = tool === 'sample' ? labels.pick : isCropping ? strings.EditorCrop : labels[tool];
  const percentX = (value: number): string => (value / dimensions.width * 100) + '%';
  const percentY = (value: number): string => (value / dimensions.height * 100) + '%';

  return <div>
    <div className={studio.stage}>
      <div className={studio.dock}>
        {!props.cropAspect && <div className={studio.toolGroup} role="group" aria-label={labels.tools}>
          {(['select', 'colour', 'add', 'erase', 'clear'] as const).map(item => {
            const tooltipId = helpId + '-' + item;
            const inactive = selectionDisabled || (item === 'clear' && !hasSelection);
            return <TooltipHost key={item} id={tooltipId} content={labels[item] + '. ' + toolHelp[item]} setAriaDescribedBy={false}>
              <button type="button" className={studio.tool} aria-label={labels[item]} aria-describedby={tooltipId}
                aria-pressed={item === 'clear' ? undefined : tool === item} aria-disabled={inactive}
                onClick={() => { if (!inactive) { if (item === 'clear') clear(); else setTool(item); } }}>
                <StudioIcon name={item} />
              </button>
            </TooltipHost>;
          })}
        </div>}
        {props.cropAspect && <StudioIcon name="crop" />}
        {ready && <ResizeImageControl base={props.resizeBase || dimensions} target={props.resizeTarget}
          disabled={unavailable} onResize={props.onResize} locale={props.locale} />}
        {(tool === 'add' || tool === 'erase') && !props.cropAspect && <label className={studio.brushControl}>
          {labels.brush}<input aria-label={labels.brush} type="range" min={3} max={70} value={diameter}
            aria-valuetext={diameter + ' px'} disabled={selectionDisabled} onChange={e => setDiameter(Number(e.target.value))} />
          <span>{diameter} px</span>
        </label>}
        {!canvasDisabled && <div id={helpId + '-tool'} aria-live="polite" className={studio.toolHelp}>
          <strong>{activeLabel}</strong>{' · '}{hint}
        </div>}
      </div>
      <div className={studio.desk}>
        <span id={helpId} style={keyboardOnly}>{labels.keyboard}</span>
        <div style={{ ...checkerboard, position: 'relative', isolation: 'isolate', overflow: 'hidden', margin: '0 auto',
          width: 'min(100%, ' + dimensions.width + 'px, ' + (42 * dimensions.width / dimensions.height) + 'vh)' }}>
      <canvas ref={source} role="button" tabIndex={canvasDisabled ? -1 : 0} aria-label={labels.image}
        aria-describedby={canvasDisabled ? helpId : helpId + ' ' + helpId + '-tool'} aria-disabled={canvasDisabled} onKeyDown={onKey} onBlur={() => setKeyboardPoint(undefined)}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp}
        style={{ display: 'block', width: '100%', touchAction: 'none', cursor: canvasDisabled ? 'default' : isCropping ? 'move' : 'crosshair' }} />
      <canvas ref={overlay} aria-hidden="true" className={hasSelection && !isCropping && !props.disabled ? pulsingSelection : undefined}
        style={{ display: isCropping ? 'none' : 'block', position: 'absolute', inset: 0,
        zIndex: 1, width: '100%', height: '100%', pointerEvents: 'none' }} />
      {isCropping && ready && <div aria-hidden="true" style={{ pointerEvents: 'none', position: 'absolute', boxSizing: 'border-box',
        left: percentX(crop.x), top: percentY(crop.y), width: percentX(crop.width), height: percentY(crop.height),
        border: '2px solid white', boxShadow: '0 0 0 9999px rgba(0,0,0,.52)' }} />}
      {keyboardPoint && <div aria-hidden="true" style={{ position: 'absolute', zIndex: 2, width: 9, height: 9, border: '2px solid white',
        borderRadius: '50%', boxShadow: '0 0 0 1px black', pointerEvents: 'none', transform: 'translate(-50%, -50%)',
        left: percentX(keyboardPoint.x), top: percentY(keyboardPoint.y) }} />}
        </div>
      </div>
    </div>
    {!!props.cropAspect && <label className={studio.hint}>{labels.crop} <input type="range" min={20} max={100} value={cropPercent}
      disabled={unavailable} onChange={e => setCropPercent(Number(e.target.value))} /> {cropPercent}%</label>}
  </div>;
});

interface IColourProps {
  value: string;
  hexText: string;
  onHexTextChange: (text: string) => void;
  onChange: (hex: string) => void;
  onPick: () => void;
  disabled?: boolean;
  locale?: string;
  recolour?: boolean;
}

export function EditorColourPicker({ value, hexText, onHexTextChange, onChange, onPick, disabled, locale, recolour }: IColourProps): React.ReactElement {
  const labels = selectionLabels(locale);
  const valid = /^#?[0-9a-f]{6}$/i.test(hexText);
  return <div className={studio.colourPicker}>
    <label>{recolour ? strings.EditorNewColour : labels.swatch} <input type="color" value={value} disabled={disabled}
      onChange={e => onChange(e.target.value.toUpperCase())} /></label>
    <label>{labels.hex} <input type="text" value={hexText} size={8} maxLength={7} aria-invalid={!valid}
      disabled={disabled} onChange={e => {
        const next = e.target.value;
        onHexTextChange(next);
        if (/^#?[0-9a-f]{6}$/i.test(next)) onChange('#' + next.replace('#', '').toUpperCase());
      }} /></label>
    <DefaultButton text={recolour ? strings.EditorSampleColour : labels.pick} onRenderIcon={() => <StudioIcon name="colour" size={16} />}
      disabled={disabled} onClick={onPick} />
    {!valid && !recolour && <span role="status">{labels.emptyHex}</span>}
  </div>;
}
