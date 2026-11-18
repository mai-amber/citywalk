import { tileLayout } from './core.js';

const API = 'https://tile.googleapis.com/v1/';
export class StreetTiles {
  constructor(key) { this.key = key; this.session = null; }
  async request(url, options = {}) {
    const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(20000) });
    if (!response.ok) {
      if (['localhost', '127.0.0.1'].includes(location.hostname)) {
        const detail = (await response.text()).replaceAll(this.key, '[key]').replaceAll(this.session?.session || 'NO_SESSION', '[session]');
        console.warn(`Street View ${response.status} ${new URL(url).pathname}: ${detail.slice(0,1200)}`);
      }
      const message = response.status === 403
        ? 'Google has not enabled Street View VR for this app yet.'
        : response.status === 429 ? 'Street View is busy. Please try again shortly.'
          : 'That street could not load. Check your connection and try again.';
      throw new Error(message);
    }
    return response;
  }
  async ensureSession() {
    if (this.session && Number(this.session.expiry) * 1000 > Date.now() + 60000) return;
    const response = await this.request(`${API}createSession?${new URLSearchParams({ key: this.key })}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapType: 'streetview', language: 'en-US', region: 'IL' }),
    });
    this.session = await response.json();
  }
  url(path, parameters) {
    return `${API}${path}?${new URLSearchParams({ ...parameters, session: this.session.session, key: this.key })}`;
  }
  async metadata(location) {
    await this.ensureSession();
    const response = await this.request(this.url('streetview/metadata', location));
    const data = await response.json();
    if (!data.panoId || !data.copyright) throw new Error('No Street View imagery is available here.');
    return data;
  }
  async image(metadata, zoom = 4, onProgress = () => {}) {
    const layout = tileLayout(metadata, zoom);
    const canvas = document.createElement('canvas');
    canvas.width = layout.width; canvas.height = layout.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This browser could not prepare the Street View image.');
    const count = layout.columns * layout.rows;
    let cursor = 0, completed = 0;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    // Only load the view requested by the user. No route prefetch or persistent imagery cache.
    const workers = Array.from({ length: Math.min(6, count) }, async () => {
      while (cursor < count) {
        const index = cursor++, x = index % layout.columns, y = Math.floor(index / layout.columns);
        const response = await this.request(this.url(`streetview/tiles/${zoom}/${x}/${y}`, { panoId: metadata.panoId }), { signal: controller.signal });
        const bitmap = await createImageBitmap(await response.blob());
        try { context.drawImage(bitmap, x * layout.tileWidth, y * layout.tileHeight); }
        finally { bitmap.close(); }
        onProgress(++completed / count);
      }
    });
    try {
      await Promise.all(workers);
      return canvas;
    } catch (error) {
      controller.abort();
      await Promise.allSettled(workers);
      canvas.width = canvas.height = 1;
      if (error.name === 'AbortError' || error.name === 'TimeoutError') throw new Error('The next street took too long to load. Press again to retry.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
}
