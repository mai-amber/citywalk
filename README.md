# City Walk

Real Street View navigation for phones, tablets, and Meta Quest.

This is an independent copy of City Walk. The original public link remains at https://embodied-navigation-lab.amb-mai.chatgpt.site/ and is managed separately.

## Use

- **Regular:** swipe to look, pinch to zoom, and tap the street or Google's arrows to move.
- **Gyro:** allow motion access, turn the device to look around, and tap Forward to follow the street ahead. Recenter is available in this mode.
- **Quest:** open the site in Quest Browser, select Enter VR, turn your head, and press either trigger or A/X to move. B/Y exits VR.

The starting point is near Rue Montorgueil in Paris. Movement follows Google's linked photographic viewpoints. This prototype does not record research sessions or request location. The About page includes privacy information and Google terms.

VR uses progressive loading: a small 360° panorama opens first and immediately unlocks the next move. The same view sharpens in the background. Moving again cancels the previous refinement; a failed refinement leaves the small view usable. The previous street stays visible during loading, with a short blend into the next view.

## Publish on GitHub Pages

The complete deployable website is in `docs/`; no build step or dependency installation is needed. In repository Settings → Pages, select **Deploy from a branch**, branch **main**, folder **/docs**, and Save. `.nojekyll` keeps the static files unchanged.

All app asset paths are relative, so the site works under a GitHub Pages project path. The HTML pages request `noindex, nofollow`; this is not password protection. Anyone with the public link can use the app.

## Maps configuration

`docs/maps-config.json` contains a browser Maps key. Browser keys are visible to visitors and must be restricted in Google Cloud. Use a dedicated key named **City Walk — GitHub Pages** with these restrictions:

- Websites: `https://mai-amber.github.io/*`, `http://localhost:4317/*`, and `http://127.0.0.1:4317/*`.
- APIs: **Maps JavaScript API** and **Map Tiles API** only.

The phone viewer uses Maps JavaScript API. Quest uses Map Tiles API. Only the requested panorama is loaded; imagery is not stored to files or browser storage. Current Google attribution and reporting links remain visible.

## Local development

Run `npm start`, then open `http://localhost:4317`. The local-only `/setup` page accepts the restricted browser key and writes `docs/maps-config.json`. It is not deployed to GitHub Pages. Do not paste keys into chat or shell commands.

- `npm test` checks the sensor math, street selection, controller button behavior, and movement safeguards.
- `npm run check` checks JavaScript syntax.
- `npm run check:release` also checks that the browser key is configured.

The local `/xr-test` page uses Meta's IWER 2.8.0 emulator to exercise the Quest viewer. Its code stays outside `docs/`. Actual phone motion and physical Quest behavior still require on-device checks.

Source copied from original commit `13c50c02eb4de1551c7d056a31a3fc59a6c92770`. The original site is maintained independently.
