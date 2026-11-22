export interface IOutputSize { width: number; height: number; }
export interface IResizeTarget extends IOutputSize { anchor?: 'width' | 'height'; }
export interface ICropRect extends IOutputSize {
  x: number;
  y: number;
}

// Keep new PNGs within the editor's input and browser canvas budgets.
export function validOutputSize(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 &&
    width <= 16384 && height <= 16384 && width * height <= 4_194_304;
}

export function resolveResizeTarget(target: IResizeTarget, base: IOutputSize): IResizeTarget {
  if (target.anchor === 'width') return { ...target, height: Math.max(1, Math.round(target.width * base.height / base.width)) };
  if (target.anchor === 'height') return { ...target, width: Math.max(1, Math.round(target.height * base.width / base.height)) };
  return target;
}

export function applyResize(source: HTMLCanvasElement, size: IOutputSize): HTMLCanvasElement {
  if (!validOutputSize(size.width, size.height)) throw new Error('Invalid output image dimensions.');
  if (source.width === size.width && source.height === size.height) return source;
  const result = makeCanvas(size.width, size.height);
  const ctx = context2d(result);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return result;
}

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  return ctx;
}

export function applyBackground(source: HTMLCanvasElement, mask: HTMLCanvasElement, colour?: string): HTMLCanvasElement {
  if (source.width !== mask.width || source.height !== mask.height) throw new Error('The selection does not match the image.');
  const result = makeCanvas(source.width, source.height);
  const ctx = context2d(result);
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  if (colour) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, result.width, result.height);
  }
  ctx.globalCompositeOperation = 'source-over';
  return result;
}

export function applyCrop(source: HTMLCanvasElement, rect: ICropRect): HTMLCanvasElement {
  const { x, y, width, height } = rect;
  const result = makeCanvas(width, height);
  context2d(result).drawImage(source, x, y, width, height, 0, 0, width, height);
  return result;
}

export function cropAt(width: number, height: number, aspect: number, fraction: number, cx: number, cy: number): ICropRect {
  const w = Math.max(1, Math.floor(Math.min(width, height * aspect) * fraction));
  const h = Math.max(1, Math.min(height, Math.round(w / aspect)));
  return {
    width: w, height: h,
    x: Math.max(0, Math.min(width - w, Math.round(cx - w / 2))),
    y: Math.max(0, Math.min(height - h, Math.round(cy - h / 2))),
  };
}
