// Each move owns its requests. Only the preview blocks navigation; detail is optional.
export class ProgressivePanorama {
  constructor(tiles, { showPreview, showDetail, release, onDetailError = () => {}, detailZoom = 4 }) {
    Object.assign(this, { tiles, showPreview, showDetail, release, onDetailError, detailZoom });
    this.request = null;
    this.detailTask = Promise.resolve();
  }
  cancel() {
    this.request?.abort();
    this.request = null;
  }
  async load(location) {
    this.cancel();
    const request = this.request = new AbortController();
    const options = { signal: request.signal };
    const metadata = await this.tiles.metadata(location, options);
    const preview = await this.tiles.image(metadata, 2, () => {}, options);
    if (this.request !== request || request.signal.aborted) { this.release(preview); return false; }
    await this.showPreview(metadata, preview);
    if (this.request !== request || request.signal.aborted) return false;
    this.detailTask = this.refine(metadata, request);
    return metadata;
  }
  async refine(metadata, request) {
    try {
      const detail = await this.tiles.image(metadata, this.detailZoom, () => {}, { signal: request.signal });
      if (this.request !== request || request.signal.aborted) { this.release(detail); return; }
      this.showDetail(metadata, detail);
    } catch (error) {
      // A failed refinement leaves the usable preview in place.
      if (this.request === request && !request.signal.aborted) this.onDetailError(error);
    }
  }
}
