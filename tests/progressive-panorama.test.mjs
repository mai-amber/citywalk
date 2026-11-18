import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressivePanorama } from '../docs/progressive-panorama.js';
import { StreetTiles } from '../docs/street-tiles.js';
import { MovementGate } from '../docs/quest-controls.js';
import { tileLayout } from '../docs/core.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
function fixture() {
  const details = [], shown = [], released = [], errors = [];
  const tiles = {
    async metadata({ panoId }) { return { panoId }; },
    async image(metadata, zoom, progress, { signal }) {
      if (zoom === 2) return { panoId: metadata.panoId, quality: 'preview' };
      const pending = deferred(); details.push({ ...pending, signal }); return pending.promise;
    },
  };
  const loader = new ProgressivePanorama(tiles, {
    showPreview: async (metadata, image) => shown.push(image),
    showDetail: (metadata, image) => shown.push(image),
    release: image => released.push(image), onDetailError: error => errors.push(error),
  });
  return { loader, details, shown, released, errors };
}
test('movement unlocks after the preview while detail is still downloading', async () => {
  const f = fixture(), gate = new MovementGate();
  assert.equal(await gate.run(() => f.loader.load({ panoId: 'one' }), 0), true);
  assert.equal(gate.busy, false);
  assert.deepEqual(f.shown, [{ panoId: 'one', quality: 'preview' }]);
  assert.equal(f.details.length, 1);
  assert.equal(await gate.run(() => f.loader.load({ panoId: 'two' }), 500), true);
  assert.equal(f.details[0].signal.aborted, true);
  f.details.forEach(d => d.resolve({}));
  await f.loader.detailTask;
});
test('a late old detail cannot replace the new view and its image is released', async () => {
  const f = fixture();
  await f.loader.load({ panoId: 'one' }); const previousTask = f.loader.detailTask;
  await f.loader.load({ panoId: 'two' });
  const old = { panoId: 'one', quality: 'detail' };
  f.details[0].resolve(old); await previousTask;
  assert.deepEqual(f.released, [old]);
  assert.equal(f.shown.at(-1).panoId, 'two');
  const detail = { panoId: 'two', quality: 'detail' };
  f.details[1].resolve(detail); await f.loader.detailTask;
  assert.equal(f.shown.at(-1), detail);
});
test('failed sharpening preserves the preview and does not reject navigation', async () => {
  const f = fixture(); await f.loader.load({ panoId: 'one' });
  f.details[0].reject(new Error('offline')); await f.loader.detailTask;
  assert.equal(f.shown.at(-1).quality, 'preview');
  assert.equal(f.errors.length, 1);
});
test('leaving the viewer cancels refinement and discards a late result', async () => {
  const f = fixture(); await f.loader.load({ panoId: 'one' }); f.loader.cancel();
  assert.equal(f.details[0].signal.aborted, true);
  const detail = {}; f.details[0].resolve(detail); await f.loader.detailTask;
  assert.deepEqual(f.released, [detail]); assert.equal(f.shown.length, 1);
});
test('preview uses at most eight tiles across supported panorama sizes', () => {
  for (const [imageWidth, imageHeight] of [[13312, 6656], [16384, 8192]]) {
    const preview = tileLayout({ imageWidth, imageHeight }, 2);
    const detail = tileLayout({ imageWidth, imageHeight }, 4);
    assert.ok(preview.columns * preview.rows <= 8);
    assert.equal(preview.width * preview.height * 16, detail.width * detail.height);
  }
});
test('cancelling a tile image aborts every in-flight fetch and releases its canvas', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document;
  const canvas = { getContext: () => ({ drawImage() {} }) };
  let started = 0, cancelled = 0;
  globalThis.document = { createElement: () => canvas };
  globalThis.fetch = (url, { signal }) => new Promise((resolve, reject) => {
    started++;
    signal.addEventListener('abort', () => { cancelled++; reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
  });
  try {
    const tiles = new StreetTiles('test'); tiles.session = { session: 'test' };
    const controller = new AbortController();
    const image = tiles.image({ imageWidth: 13312, imageHeight: 6656 }, 4, () => {}, { signal: controller.signal });
    assert.equal(started, 6); controller.abort();
    await assert.rejects(image, { name: 'AbortError' });
    assert.equal(cancelled, 6); assert.equal(canvas.width, 1); assert.equal(canvas.height, 1);
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument; }
});
