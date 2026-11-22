// A click selects a connected component, so another object of the same colour
// elsewhere in the image stays unselected. Work at preview resolution.
type Raster = Pick<ImageData, 'width' | 'height' | 'data'>;

function component(candidates: Uint8Array, width: number, seed: number): Uint8Array {
  const selected = new Uint8Array(candidates.length);
  const queue = new Int32Array(candidates.length);
  let head = 0;
  let tail = 0;
  function visit(i: number): void {
    if (candidates[i] && !selected[i]) {
      selected[i] = 255;
      queue[tail++] = i;
    }
  }
  visit(seed);
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    if (x > 0) visit(i - 1);
    if (x + 1 < width) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i + width < candidates.length) visit(i + width);
  }
  return selected;
}

function difference(data: Uint8ClampedArray, a: number, b: number): number {
  // Transparent pixels have no visible colour.
  if (data[a + 3] < 16 && data[b + 3] < 16) return 0;
  return Math.max(Math.abs(data[a] - data[b]), Math.abs(data[a + 1] - data[b + 1]),
    Math.abs(data[a + 2] - data[b + 2]), Math.abs(data[a + 3] - data[b + 3]));
}

// Compare hue as a position on the colour wheel. This keeps highlights and
// shadows in a painted sail while excluding an adjacent hull of another hue.
function colourRegion(raster: Raster, seed: number): Uint8Array {
  const { data, width, height } = raster;
  const candidates = new Uint8Array(width * height);
  const hue = (r: number, g: number, b: number, max: number, range: number): number => {
    if (!range) return 0;
    const sector = max === r ? (g - b) / range : max === g ? (b - r) / range + 2 : (r - g) / range + 4;
    return (sector + 6) % 6;
  };
  const start = seed * 4;
  const r0 = data[start], g0 = data[start + 1], b0 = data[start + 2];
  const max0 = Math.max(r0, g0, b0);
  const chroma0 = max0 - Math.min(r0, g0, b0);
  const hue0 = hue(r0, g0, b0, max0, chroma0);
  for (let i = 0; i < candidates.length; i++) {
    const j = i * 4;
    if (data[j + 3] < 16) continue;
    const r = data[j], g = data[j + 1], b = data[j + 2];
    const max = Math.max(r, g, b);
    const chroma = max - Math.min(r, g, b);
    if (chroma0 < 28 || chroma0 < max0 * 0.18) {
      if (difference(data, start, j) <= 44) candidates[i] = 1;
    } else if (chroma >= 14 && Math.abs(max0 - max) < 145 && Math.abs(chroma / max - chroma0 / max0) < 0.55) {
      const delta = Math.abs(hue0 - hue(r, g, b, max, chroma));
      if (Math.min(delta, 6 - delta) <= 0.43) candidates[i] = 1;
    }
  }
  return component(candidates, width, seed);
}

// A simple backdrop is common in product images and illustrations. Identify
// its main colours at the frame edges. A subject can then contain several
// strongly contrasting colours without splitting at each interior edge.
function backdropSamples({ data, width, height }: Raster): number[] {
  const edge: number[] = [];
  for (let x = 0; x < width; x++) edge.push(x * 4, ((height - 1) * width + x) * 4);
  for (let y = 1; y < height - 1; y++) edge.push(y * width * 4, (y * width + width - 1) * 4);
  const modes: number[] = [];
  let rest = edge;
  for (let k = 0; k < 3 && rest.length; k++) {
    let best = rest[0];
    let count = 0;
    const stride = Math.max(1, Math.floor(rest.length / 48));
    for (let i = 0; i < rest.length; i += stride) {
      const sample = rest[i];
      let matches = 0;
      for (const p of rest) if (difference(data, p, sample) <= 22) matches++;
      if (matches > count) { count = matches; best = sample; }
    }
    if (count < edge.length * 0.13) break;
    modes.push(best);
    rest = rest.filter(p => difference(data, p, best) > 22);
  }
  return rest.length < edge.length * 0.16 ? modes : [];
}

// For textured scenes, segment the pixel adjacency graph using the
// Felzenszwalb–Huttenlocher component threshold. A textured region can
// tolerate stronger internal edges than a flat region of the same size.
function regionLabels(raster: Raster): Int32Array {
  const { width, height, data } = raster;
  const size = width * height;
  const edges = new Int32Array(2 * size);
  const buckets = new Int32Array(256);
  buckets.fill(-1);
  for (let i = 0; i < size; i++) {
    const add = (other: number, direction: number): void => {
      const cost = difference(data, i * 4, other * 4);
      const edge = i * 2 + direction;
      edges[edge] = buckets[cost];
      buckets[cost] = edge;
    };
    if (i % width < width - 1) add(i + 1, 0);
    if (i + width < size) add(i + width, 1);
  }
  const labels = new Int32Array(size);
  const counts = new Int32Array(size);
  const threshold = new Float32Array(size);
  const scale = 310;
  threshold.fill(scale);
  counts.fill(1);
  for (let i = 0; i < size; i++) labels[i] = i;
  function root(i: number): number {
    while (labels[i] !== i) {
      labels[i] = labels[labels[i]];
      i = labels[i];
    }
    return i;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let weight = 0; weight < buckets.length; weight++) {
      for (let edge = buckets[weight]; edge >= 0; edge = edges[edge]) {
        const i = edge >>> 1;
        let a = root(i);
        let b = root(i + (edge % 2 ? width : 1));
        if (a === b) continue;
        const join = pass === 0
          ? weight <= threshold[a] && weight <= threshold[b]
          : Math.min(counts[a], counts[b]) < 8 && weight < 55;
        if (!join) continue;
        if (counts[a] < counts[b]) { const tmp = a; a = b; b = tmp; }
        labels[b] = a;
        counts[a] += counts[b];
        threshold[a] = weight + scale / counts[a];
      }
    }
  }
  for (let i = 0; i < size; i++) labels[i] = root(i);
  return labels;
}

export class ClickSegmentation {
  private readonly backdrop: number[];
  private labels?: Int32Array;

  public constructor(private readonly raster: Raster) {
    this.backdrop = backdropSamples(raster);
  }

  public select(x: number, y: number, wholeObject = true): Uint8Array {
    const { width, height, data } = this.raster;
    const seed = Math.max(0, Math.min(height - 1, Math.floor(y))) * width
      + Math.max(0, Math.min(width - 1, Math.floor(x)));
    const mask = new Uint8Array(width * height);
    if (data[seed * 4 + 3] < 16) return mask;
    if (!wholeObject) return colourRegion(this.raster, seed);
    if (this.backdrop.length && this.backdrop.every(p => difference(data, p, seed * 4) > 38)) {
      for (let i = 0; i < mask.length; i++) {
        if (data[i * 4 + 3] >= 16 && this.backdrop.every(p => difference(data, p, i * 4) > 29)) mask[i] = 1;
      }
      return component(mask, width, seed);
    }
    if (!this.labels) this.labels = regionLabels(this.raster);
    const selectedLabel = this.labels[seed];
    for (let i = 0; i < mask.length; i++) {
      if (this.labels[i] === selectedLabel && data[i * 4 + 3] >= 16) mask[i] = 255;
    }
    return mask;
  }
}
