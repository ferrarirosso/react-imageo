import { validOutputSize } from './canvasEdits';
import { fitsSourceAspect, IEditStep, matchRemovalFill, modelInstruction, needsSelection, queueStep, suggestionActions, syncResize } from './editorBatch';

describe('assisted edit batches', () => {
  it('accepts the Foundry output grid for a 4:3 source and rejects a square result', () => {
    expect(fitsSourceAspect(1024, 768, 1184, 880)).toBe(true);
    expect(fitsSourceAspect(1024, 768, 1024, 1024)).toBe(false);
  });

  it('matches a small water tint inside the removed buoy and leaves the exterior untouched', () => {
    const makeImage = (rgba: number[]): ImageData => {
      const data = new Uint8ClampedArray(32 * 32 * 4);
      for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
      return { data, width: 32, height: 32, colorSpace: 'srgb' };
    };
    const source = makeImage([45, 140, 155, 255]);
    const result = makeImage([43, 138, 151, 255]);
    const selection = makeImage([255, 255, 255, 0]);
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) {
        const offset = (y * 32 + x) * 4;
        selection.data[offset + 3] = x === 8 ? 96 : 255;
        source.data[offset] = 220;
      }
    }
    matchRemovalFill(source, result, selection);
    const edge = (12 * 32 + 8) * 4;
    expect(Array.from(result.data.slice(edge, edge + 4))).toEqual([45, 140, 155, 255]);
    expect(selection.data[edge + 3]).toBe(192);
    expect(selection.data[edge - 1]).toBe(0);
    expect(Array.from(result.data.slice(0, 4))).toEqual([43, 138, 151, 255]);
  });

  it('replaces mutually exclusive backgrounds and keeps crop after the model request', () => {
    const crop: IEditStep = { id: 1, kind: 'crop', instruction: 'crop' };
    const solid: IEditStep = { id: 2, kind: 'solid', instruction: 'solid' };
    const scene: IEditStep = { id: 3, kind: 'scene', instruction: 'Replace with waves.' };
    const remove: IEditStep = { id: 4, kind: 'remove', instruction: 'Remove the buoy.' };
    const batch = queueStep(queueStep(queueStep([crop], solid), scene), remove);
    expect(batch).toEqual([scene, remove, crop]);
    expect(modelInstruction(batch)).toEqual('1. [Outside the marked subject] Replace with waves.\n2. [Inside the marked subject] Remove the buoy.');
  });

  it('adds free text once after the model presets, preserving their common region and excluding local steps', () => {
    const remove: IEditStep = { id: 1, kind: 'remove', instruction: 'Remove the buoy.' };
    const crop: IEditStep = { id: 2, kind: 'crop', instruction: 'Crop locally.' };
    expect(modelInstruction([remove, crop], '  Fill with water.  ')).toBe(
      '1. [Inside the marked subject] Remove the buoy.\n2. [Inside the marked subject] Fill with water.');
    expect(modelInstruction([crop], 'Blue sky.')).toBe('1. Blue sky.');
    expect(modelInstruction([crop], '   ')).toBe('');
  });

  it('updates an existing preset in place and formats the same region labels that the author sees', () => {
    const remove: IEditStep = { id: 1, kind: 'remove', instruction: 'Retirer.' };
    const scene: IEditStep = { id: 2, kind: 'scene', instruction: 'La mer.' };
    const steps = queueStep([scene, remove], { ...scene, id: 8, instruction: 'Une plage.' });
    expect(steps.map(step => step.id)).toEqual([2, 1]);
    expect(modelInstruction(steps, 'Lumière douce.', { inside: 'Intérieur', outside: 'Extérieur' })).toBe(
      '1. [Extérieur] Une plage.\n2. [Intérieur] Retirer.\n3. Lumière douce.');
  });

  it('runs resize after crop, preserves the edited side and keeps resize out of the model prompt', () => {
    const source = { width: 1600, height: 900 };
    const resize: IEditStep = { id: 1, kind: 'resize', resize: { width: 640, height: 360, anchor: 'width' }, instruction: 'Resize' };
    const crop: IEditStep = { id: 2, kind: 'crop', crop: { x: 100, y: 0, width: 800, height: 800 }, instruction: 'Crop' };
    const batch = syncResize(queueStep([resize], crop), source, 'Resize');
    expect(batch.map(step => step.kind)).toEqual(['crop', 'resize']);
    expect(batch[1].resize).toEqual({ width: 640, height: 640, anchor: 'width' });
    expect(modelInstruction(batch)).toBe('');
    expect(needsSelection('resize')).toBe(false);
    expect(syncResize([batch[1]], source, 'Resize')[0].resize).toEqual(resize.resize);
    const duplicate = queueStep(batch, { ...resize, id: 3, resize: { width: 800, height: 800, anchor: 'height' } });
    expect(syncResize(duplicate, source, 'Resize')).toEqual([crop]); // Exactly the crop dimensions.
  });

  it('respects explicit proportions and rejects unsafe output sizes before allocating a canvas', () => {
    const target = { width: 317, height: 123 };
    const resize: IEditStep = { id: 1, kind: 'resize', resize: target, instruction: '' };
    expect(syncResize([resize], { width: 1200, height: 900 }, 'Resize')[0].resize).toEqual(target);
    expect(validOutputSize(2048, 2048)).toBe(true);
    expect(validOutputSize(16384, 1)).toBe(true);
    expect(validOutputSize(16385, 1)).toBe(false);
    expect(validOutputSize(2048, 2049)).toBe(false);
    expect(validOutputSize(100, 0)).toBe(false);
    expect(validOutputSize(2.5, 10)).toBe(false);
  });
});

describe('Luna instruction suggestions', () => {
  const regions = { inside: 'inside', outside: 'outside' };

  it('sends only numbered model instructions and keeps their displayed order', () => {
    const steps: IEditStep[] = [
      { id: 1, kind: 'recolour', instruction: 'Use navy', hexText: '#002144' },
      { id: 2, kind: 'crop', instruction: 'Local crop' },
      { id: 3, kind: 'scene', instruction: 'Use a marina' },
      { id: 4, kind: 'resize', instruction: 'Local resize' },
    ];
    expect(suggestionActions(steps, regions)).toEqual(['1. [inside] Use navy', '2. [outside] Use a marina']);
  });

  it('omits blank scene drafts and incomplete colours', () => {
    expect(suggestionActions([
      { id: 1, kind: 'scene', instruction: ' ' },
      { id: 2, kind: 'recolour', instruction: 'Use green', hexText: '#9' },
    ], regions)).toEqual([]);
  });
});
