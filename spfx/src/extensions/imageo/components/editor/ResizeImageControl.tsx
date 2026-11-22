import * as React from 'react';
import { TooltipHost } from '@fluentui/react';
import * as strings from 'ImageoApplicationCustomizerStrings';
import { IOutputSize, IResizeTarget, resolveResizeTarget, validOutputSize } from './canvasEdits';
import { selectionLabels } from './selectionLabels';
import { StudioIcon } from './StudioIcon';
import { studio } from './studioStyles';

interface IResizeProps {
  base: IOutputSize;
  target?: IResizeTarget;
  disabled: boolean;
  locale?: string;
  onResize: (width: number, height: number, anchor?: 'width' | 'height') => void;
}

function ResizeFields({ base, target, disabled, locale, onResize, onClose }: IResizeProps & { onClose: () => void }): React.ReactElement {
  const labels = selectionLabels(locale);
  const start = target || base;
  const [width, setWidth] = React.useState(String(start.width));
  const [height, setHeight] = React.useState(String(start.height));
  const [locked, setLocked] = React.useState(!target || !!target.anchor);
  const [anchor, setAnchor] = React.useState<'width' | 'height'>(target?.anchor || 'width');
  const first = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { first.current?.focus(); first.current?.select(); }, []);

  function change(side: 'width' | 'height', text: string, link: boolean): void {
    setAnchor(side);
    const setSide = side === 'width' ? setWidth : setHeight;
    setSide(text);
    if (!link || !Number.isSafeInteger(Number(text)) || Number(text) < 1) return;
    const paired = resolveResizeTarget({ width: Number(side === 'width' ? text : width),
      height: Number(side === 'height' ? text : height), anchor: side }, base);
    if (side === 'width') setHeight(String(paired.height));
    else setWidth(String(paired.width));
  }

  const valid = validOutputSize(Number(width), Number(height));
  const pendingAnchor = locked ? anchor : undefined;
  const changed = Number(width) !== start.width || Number(height) !== start.height ||
    (!!target && target.anchor !== pendingAnchor);
  const apply = (): void => {
    if (disabled || !valid || !changed) return;
    onResize(Number(width), Number(height), pendingAnchor);
    onClose();
  };
  return <div role="group" aria-label={strings.EditorResize} className={studio.sizeFields}
    onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
      if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type === 'number') {
        e.preventDefault(); apply();
      }
    }}>
    <div className={studio.sizePair}>
      <label>{labels.width}<input ref={first} type="number" inputMode="numeric" min={1} max={16384} step={1}
        disabled={disabled} value={width} onChange={e => change('width', e.target.value, locked)} /></label>
      <label>{labels.height}<input type="number" inputMode="numeric" min={1} max={16384} step={1}
        disabled={disabled} value={height} onChange={e => change('height', e.target.value, locked)} /></label>
    </div>
    <label><input type="checkbox" checked={locked} disabled={disabled} onChange={e => {
      setLocked(e.target.checked);
      if (e.target.checked) change(anchor, anchor === 'width' ? width : height, true);
    }} /> {labels.proportions}</label>
    {!valid && <span role="status">{strings.EditorResizeInvalid}</span>}
    <div className={studio.sizeActions}>
      <button type="button" disabled={disabled || !valid || !changed} onClick={apply}>{labels.applySize}</button>
      <button type="button" onClick={onClose}>{labels.cancelSize}</button>
    </div>
  </div>;
}

export function ResizeImageControl(props: IResizeProps): React.ReactElement {
  const { base, target, locale, disabled } = props;
  const labels = selectionLabels(locale);
  const [open, setOpen] = React.useState(false);
  const button = React.useRef<HTMLButtonElement>(null);
  const id = React.useId();
  const size = target || base;
  const close = (): void => { setOpen(false); button.current?.focus(); };
  return <>
    <div className={studio.sizeControl}>
      <TooltipHost id={id} content={labels.resizeHint} setAriaDescribedBy={false}>
        <button ref={button} type="button" className={studio.sizeToggle} aria-expanded={open} aria-label={strings.EditorResize}
          aria-describedby={id} disabled={disabled} onClick={() => setOpen(!open)}>
          <StudioIcon name="resize" size={16} /><span>{strings.EditorResize}<small>{size.width} × {size.height}</small></span>
        </button>
      </TooltipHost>
    </div>
    {open && <ResizeFields key={base.width + 'x' + base.height} {...props} onClose={close} />}
  </>;
}
