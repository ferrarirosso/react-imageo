import { applyBackground, applyCrop, applyResize, context2d, ICropRect, IOutputSize, IResizeTarget, makeCanvas, resolveResizeTarget, validOutputSize } from './canvasEdits';

export type EditKind = 'remove' | 'recolour' | 'scene' | 'custom' | 'transparent' | 'solid' | 'crop' | 'resize';
export interface IEditStep {
  id: number;
  kind: EditKind;
  instruction: string;
  colour?: string;
  hexText?: string;
  crop?: ICropRect;
  resize?: IResizeTarget;
  scene?: string;
}

export type RequestRefine = (imageBase64: string, instruction: string, guideBase64?: string) => Promise<string>;

const executionOrder: Record<EditKind, number> = {
  remove: 0, recolour: 0, scene: 0, custom: 0, transparent: 1, solid: 1, crop: 2, resize: 3
};

export function usesModel(kind: EditKind): boolean {
  return executionOrder[kind] === 0;
}

export function needsSelection(kind: EditKind): boolean {
  return kind !== 'crop' && kind !== 'custom' && kind !== 'resize';
}

function isBackground(kind: EditKind): boolean {
  return kind === 'transparent' || kind === 'solid' || kind === 'scene';
}

// Run model instructions first, then background, crop, and finally the output resize.
export function queueStep(steps: IEditStep[], next: IEditStep): IEditStep[] {
  if (steps.some(step => step.kind === next.kind && next.kind !== 'custom')) {
    return steps.map(step => step.kind === next.kind ? { ...next, id: step.id } : step);
  }
  const kept = steps.filter(step => !(isBackground(step.kind) && isBackground(next.kind)));
  const at = kept.findIndex(step => executionOrder[step.kind] > executionOrder[next.kind]);
  kept.splice(at === -1 ? kept.length : at, 0, next);
  return kept;
}

export function syncResize(steps: IEditStep[], source: IOutputSize, label: string): IEditStep[] {
  const step = steps.find(s => s.kind === 'resize');
  if (!step?.resize) return steps;
  const base = steps.find(s => s.kind === 'crop')?.crop || source;
  const size = resolveResizeTarget(step.resize, base);
  if (size.width === base.width && size.height === base.height) return steps.filter(s => s !== step);
  const instruction = label + ' · ' + size.width + ' × ' + size.height + ' px';
  if (size.width === step.resize.width && size.height === step.resize.height && instruction === step.instruction) return steps;
  return steps.map(s => s === step ? { ...s, resize: size, instruction } : s);
}

function png(canvas: HTMLCanvasElement): string {
  const encoded = canvas.toDataURL('image/png');
  const comma = encoded.indexOf(',');
  if (!encoded.startsWith('data:image/png;base64,') || encoded.length === comma + 1) {
    throw new Error('The browser could not export the edited PNG.');
  }
  return encoded.slice(comma + 1);
}

function loadResult(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('decode'));
    image.src = 'data:image/png;base64,' + base64;
  });
}

function selectionGuide(source: HTMLCanvasElement, mask: HTMLCanvasElement): string {
  const overlay = makeCanvas(source.width, source.height);
  const brush = context2d(overlay);
  brush.fillStyle = '#ff00cc';
  brush.fillRect(0, 0, overlay.width, overlay.height);
  brush.globalCompositeOperation = 'destination-in';
  brush.drawImage(mask, 0, 0);
  const guide = makeCanvas(source.width, source.height);
  const ctx = context2d(guide);
  ctx.drawImage(source, 0, 0);
  ctx.globalAlpha = 0.58;
  ctx.drawImage(overlay, 0, 0);
  return png(guide);
}

export interface IRegionLabels { inside: string; outside: string; }
const englishRegions = { inside: 'Inside the marked subject', outside: 'Outside the marked subject' };

export function instructionPrefix(kind: EditKind, index: number, labels: IRegionLabels): string {
  const region = needsSelection(kind) ? '[' + (kind === 'scene' ? labels.outside : labels.inside) + '] ' : '';
  return (index + 1) + '. ' + region;
}

/** Send the model instructions the editor displays, in the same order. */
export function suggestionActions(steps: IEditStep[], regions: IRegionLabels): string[] {
  const actions: string[] = [];
  steps.filter(step => usesModel(step.kind)).forEach((step, index) => {
    const instruction = step.instruction.trim();
    if (!instruction || (step.hexText !== undefined && !/^#?[0-9a-f]{6}$/i.test(step.hexText))) return;
    actions.push(instructionPrefix(step.kind, index, regions) + instruction);
  });
  return actions;
}

// Extra detail follows the scope of the model presets when they all address the same region.
export function additionalScope(steps: IEditStep[]): EditKind {
  if (steps.length && steps.every(step => step.kind === 'remove' || step.kind === 'recolour')) return 'recolour';
  if (steps.length && steps.every(step => step.kind === 'scene')) return 'scene';
  return 'custom';
}

export function modelInstruction(steps: IEditStep[], additional = '', regions: IRegionLabels = englishRegions): string {
  const model = steps.filter(step => usesModel(step.kind));
  const lines = model.map((step, index) => instructionPrefix(step.kind, index, regions) + step.instruction.trim());
  if (additional.trim()) lines.push(instructionPrefix(additionalScope(model), model.length, regions) + additional.trim());
  return lines.join('\n');
}

// Estimate a small colour cast using only opaque, unselected pixels beside the removal.
// A wide spread means the reference area changed and cannot supply a reliable correction.
export function matchRemovalFill(source: ImageData, result: ImageData, selection: ImageData): void {
  const { width, height } = source;
  const mask = selection.data;
  const histograms = [new Uint32Array(511), new Uint32Array(511), new Uint32Array(511)];
  const radius = Math.min(6, Math.max(2, Math.round(Math.min(width, height) / 160)));
  let samples = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (mask[i + 3] || source.data[i + 3] < 250 || result.data[i + 3] < 250) continue;
      const besideSelection = (x >= radius && mask[i + 3 - radius * 4])
        || (x + radius < width && mask[i + 3 + radius * 4])
        || (y >= radius && mask[i + 3 - radius * width * 4])
        || (y + radius < height && mask[i + 3 + radius * width * 4]);
      if (!besideSelection) continue;
      for (let c = 0; c < 3; c++) histograms[c][255 + source.data[i + c] - result.data[i + c]]++;
      samples++;
    }
  }
  const offsets = histograms.map(histogram => {
    if (samples < 32) return 0;
    let count = 0, lower = 0, median = 0;
    for (let bin = 0; bin < histogram.length; bin++) {
      const previous = count;
      count += histogram[bin];
      if (previous < samples / 4 && count >= samples / 4) lower = bin;
      if (previous < samples / 2 && count >= samples / 2) median = bin - 255;
      if (count >= 3 * samples / 4) return bin - lower <= 12 && Math.abs(median) <= 16 ? median : 0;
    }
    return 0;
  });
  for (let i = 0; i < mask.length; i += 4) {
    if (!mask[i + 3]) continue;
    // Partly selected object edges must be removed along with their original colour.
    mask[i + 3] = Math.min(255, 2 * mask[i + 3]);
    for (let c = 0; c < 3; c++) result.data[i + c] += offsets[c];
  }
}

// Combine the original and generated pixels through complementary alpha masks.
// Adding the premultiplied contributions also preserves feathered edges.
function protectOutside(source: HTMLCanvasElement, result: HTMLCanvasElement, mask: HTMLCanvasElement, keepSubject: boolean): HTMLCanvasElement {
  const output = makeCanvas(source.width, source.height);
  const ctx = context2d(output);
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = keepSubject ? 'destination-in' : 'destination-out';
  ctx.drawImage(mask, 0, 0);
  const edited = context2d(result);
  edited.globalCompositeOperation = keepSubject ? 'destination-out' : 'destination-in';
  edited.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(result, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  return output;
}

// The service rounds output dimensions to its native grid. A larger change moves edits out of register.
export function fitsSourceAspect(sourceWidth: number, sourceHeight: number, resultWidth: number, resultHeight: number): boolean {
  const relativeAspect = resultWidth * sourceHeight / (resultHeight * sourceWidth);
  return Math.abs(relativeAspect - 1) <= 0.02;
}

export async function applyBatch(
  sourceBase64: string, source: HTMLCanvasElement, mask: HTMLCanvasElement | undefined, steps: IEditStep[],
  requestRefine: RequestRefine, alignmentError: string, decodeError: string,
  additional = '', regions: IRegionLabels = englishRegions
): Promise<string> {
  const ai = steps.filter(step => usesModel(step.kind));
  const local = steps.filter(step => !usesModel(step.kind));
  const resize = local.find(step => step.kind === 'resize');
  if (resize && (!resize.resize || !validOutputSize(resize.resize.width, resize.resize.height))) {
    throw new Error('Invalid output image dimensions.');
  }
  let output = source;
  if (!mask && steps.some(step => needsSelection(step.kind))) throw new Error('A selection is required for these actions.');
  const prompt = modelInstruction(ai, additional, regions);
  if (prompt) {
    const targeted = ai.some(step => needsSelection(step.kind));
    const guide = mask && targeted ? selectionGuide(source, mask) : undefined;
    const response = await requestRefine(sourceBase64, prompt, guide);
    // Unrestricted free-form edits can use the service's native output dimensions.
    if (!targeted && !local.length) return response;
    const image = await loadResult(response).catch(() => { throw new Error(decodeError); });
    if (!fitsSourceAspect(source.width, source.height, image.naturalWidth, image.naturalHeight)) {
      throw new Error(alignmentError);
    }
    output = makeCanvas(source.width, source.height);
    context2d(output).drawImage(image, 0, 0, output.width, output.height);
    const foreground = ai.some(step => step.kind === 'remove' || step.kind === 'recolour');
    const background = ai.some(step => step.kind === 'scene');
    if (mask && !ai.some(step => step.kind === 'custom') && foreground !== background) {
      let blendMask = mask;
      if (ai.every(step => step.kind === 'remove')) {
        const width = source.width, height = source.height;
        const sourcePixels = context2d(source).getImageData(0, 0, width, height);
        const resultPixels = context2d(output).getImageData(0, 0, width, height);
        const maskPixels = context2d(mask).getImageData(0, 0, width, height);
        matchRemovalFill(sourcePixels, resultPixels, maskPixels);
        context2d(output).putImageData(resultPixels, 0, 0);
        blendMask = makeCanvas(width, height);
        context2d(blendMask).putImageData(maskPixels, 0, 0);
      }
      output = protectOutside(source, output, blendMask, background);
    }
  }
  for (const step of local) {
    if (step.kind === 'crop' && step.crop) output = applyCrop(output, step.crop);
    if (mask && (step.kind === 'transparent' || step.kind === 'solid')) {
      output = applyBackground(output, mask, step.colour);
    }
  }
  // Resize once at the end so the crop and all masks use source pixel coordinates.
  return png(resize?.resize ? applyResize(output, resize.resize) : output);
}
