import { ClickSegmentation } from './segmentation';

const width = 80;
const height = 60;
type Colour = [number, number, number, number];

function raster(colourAt: (x: number, y: number) => Colour): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(colourAt(x, y), (y * width + x) * 4);
  }
  return { data, width, height };
}

describe('Imageo click selection', () => {
  const twoBoats = raster((x, y) => {
    const inBoat = (x >= 7 && x <= 28 || x >= 47 && x <= 68) && y >= 12 && y <= 35;
    if (!inBoat) return [0, 0, 0, 0];
    if (y >= 27) return [35, 50, 120, 255];
    return y > 20 ? [170, 90, 35, 255] : [240, 135, 42, 255];
  });

  it('selects one connected subject, including interior colours', () => {
    const selected = new ClickSegmentation(twoBoats).select(12, 16);
    expect(selected[21 * width + 9]).toBe(255);
    expect(selected[34 * width + 12]).toBe(255);
    expect(selected[21 * width + 50]).toBe(0);
    expect(selected[36 * width + 12]).toBe(0);
  });

  it('leaves empty transparent pixels unselected', () => {
    const segments = new ClickSegmentation(twoBoats);
    expect(segments.select(0, 0).some(Boolean)).toBe(false);
    expect(segments.select(0, 0, false).some(Boolean)).toBe(false);
  });

  it('selects shaded orange pixels while excluding the touching navy hull and the other sail', () => {
    const selected = new ClickSegmentation(twoBoats).select(12, 16, false);
    expect(selected[24 * width + 13]).toBe(255);
    expect(selected[34 * width + 12]).toBe(0);
    expect(selected[24 * width + 50]).toBe(0);
  });

  it('segments a bounded region against a textured backdrop', () => {
    const image = raster((x, y) => {
      if (x > 10 && x < 20 && y > 10 && y < 30) return [216, 40, 65, 255];
      return [(x * 17 + y * 3) % 255, (x + y * 23) % 255, (x * 11 + y * 17) % 255, 255];
    });
    const selected = new ClickSegmentation(image).select(14, 15);
    expect(selected[28 * width + 18]).toBe(255);
    expect(selected[45 * width + 26]).toBe(0);
  });
});
