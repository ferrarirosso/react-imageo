const outlineSurfaces = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

// How much selection coverage disappears when the mask is contracted by this radius?
// Treat the image boundary and unselected holes alike.
function edgeCoverage(alpha: Uint8ClampedArray, x: number, y: number, w: number, h: number, i: number, radius: number): number {
  if (x < radius || y < radius || x + radius >= w || y + radius >= h) return alpha[i];
  const across = 4 * radius;
  const down = across * w;
  return Math.max(0, alpha[i] - Math.min(alpha[i - across], alpha[i + across], alpha[i - down], alpha[i + down]));
}

function selectionOutline(canvas: HTMLCanvasElement, mask: HTMLCanvasElement, source: HTMLCanvasElement, scale: number, thumbnail: boolean): HTMLCanvasElement {
  let surface = outlineSurfaces.get(canvas);
  if (!surface) {
    surface = document.createElement('canvas');
    outlineSurfaces.set(canvas, surface);
  }
  const { width: w, height: h } = canvas;
  if (surface.width !== w) surface.width = w;
  if (surface.height !== h) surface.height = h;
  const ctx = surface.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(mask, 0, 0, w, h);
  const maskPixels = ctx.getImageData(0, 0, w, h).data;
  // Composite transparent source pixels over the light checkerboard used by the editor.
  ctx.fillStyle = '#ededed';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const pixels = image.data;
  const outerWidth = Math.max(1, Math.round(scale * (thumbnail ? 0.8 : 1.5)));
  const totalWidth = outerWidth + Math.max(1, Math.round(scale * (thumbnail ? 0.6 : 1)));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const alpha = i + 3;
      const rim = maskPixels[alpha] && edgeCoverage(maskPixels, x, y, w, h, alpha, totalWidth);
      pixels[alpha] = rim;
      if (!rim) continue;
      const brightness = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
      const outerInk = brightness < 128 ? 255 : 24;
      const innerInk = brightness < 128 ? 24 : 255;
      const outer = Math.min(rim, edgeCoverage(maskPixels, x, y, w, h, alpha, outerWidth)) / rim;
      const ink = Math.round(outerInk * outer + innerInk * (1 - outer));
      pixels[i] = pixels[i + 1] = pixels[i + 2] = ink;
    }
  }
  ctx.putImageData(image, 0, 0);
  return surface;
}

/** Paint at display resolution. Drawing the preview never changes the source or edit mask. */
export function drawSelectionPreview(canvas: HTMLCanvasElement, mask: HTMLCanvasElement, source: HTMLCanvasElement, thumbnail = false): void {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.setTransform(w / width, 0, 0, h / height, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(100, 72, 218, 0.16)';
  ctx.fillRect(0, 0, width, height);
  // The two-tone lines stay distinguishable on pale, dark and similarly coloured objects.
  const spacing = thumbnail ? 7 : 12;
  ctx.beginPath();
  for (let x = 0; x < width + height; x += spacing) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x - height, height);
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.lineWidth = thumbnail ? 2.25 : 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(39, 28, 70, 0.92)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(selectionOutline(canvas, mask, source, scale, thumbnail), 0, 0, width, height);
  if (thumbnail) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(source, 0, 0, width, height);
  }
  ctx.restore();
}
