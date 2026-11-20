# City Walk

Real Street View navigation for phones, tablets, and Meta Quest.

This is an independent copy of City Walk. The original public link remains at https://embodied-navigation-lab.amb-mai.chatgpt.site/ and is managed separately.

## Use

- **Regular:** swipe to look, pinch to zoom, and tap the street or Google's arrows to move.
- **Gyro:** allow motion access, turn the device to look around, and tap Forward to follow the street ahead. Recenter is available in this mode.
- **Quest:** open the site in Quest Browser, select Enter VR, turn your head, and press either trigger or A/X to move. B/Y exits VR.

The starting point is near Rue Montorgueil in Paris. Movement follows Google's linked photographic viewpoints. Recording begins automatically when the street opens. The app does not request GPS location. The About page includes privacy information and Google terms.

VR uses progressive loading: a small 360° panorama opens first and immediately unlocks the next move. The same view sharpens in the background. Moving again cancels the previous refinement; a failed refinement leaves the small view usable. The previous street stays visible during loading, with a short blend into the next view.

## Automatic CSV recording

Open the viewer and use it normally. **Download CSV** exports all recordings saved in this browser, including a snapshot of the current session. Recording continues after downloading. In browser VR, point at Download CSV and press a trigger; this returns to the browser and downloads the data. No participant form or Start/Finish button is required.

Each page visit starts a new `session_id`. `participant_code` is an automatically generated `AUTO-...` code for that visit, not a stable participant identity. Returning from the background keeps the same session; reloading starts a new one. Use session IDs to separate trials and maintain any participant-to-session mapping separately.

Logs stay on the device in IndexedDB, flushed about once a second. They are never uploaded to GitHub, Google or a research server. Earlier sessions are included in subsequent downloads; clearing site data or private browsing can remove them. An unfinished recovered recording is marked `session_incomplete` on export, with its last saved timestamp. A hard crash may lose the last unflushed second. CSV files are UTF-8 with BOM, standard quoting and spreadsheet-formula protection for text.

### CSV fields

Phone, browser VR and the native APK use the same 27 columns. Missing measurements are blank, not zero. The timestamps and events are raw observations; pauses, backtracking and route metrics can be derived from them. No task goal, correct route, recognition test or confidence questionnaire has been defined, so those scores are not inferred.

| Columns | Meaning |
| --- | --- |
| `schema_version`, `session_id`, `participant_code`, `platform`, `condition` | Schema version 1; unique recording; automatic visit code; phone_web / quest_web / quest_apk / desktop_preview; regular / gyro / quest. Mode changes remain within a session. |
| `event_index`, `event`, `elapsed_ms`, `utc_time` | Ordered event number, event type, monotonic elapsed milliseconds and UTC ISO timestamp. Background intervals remain in elapsed time and have explicit visibility/pause events. |
| `view_id`, `visit_index`, `target_view_id` | Panorama identifier, zero-based visit sequence (including revisits), and requested destination where known. Google identifiers can change; they are not permanent route identifiers. |
| `heading_deg`, `pitch_deg`, `roll_deg`, `zoom` | Displayed view: heading clockwise from north, pitch positive upward, available roll and SDK zoom. Zoom is blank in VR. |
| `source`, `qx`, `qy`, `qz`, `qw`, `x_m`, `y_m`, `z_m`, `tracking_valid` | Input source or pose source. Gyro quaternions use the phone sensor reference; Quest poses use the platform's local tracking reference, not geographic coordinates. Unity and WebXR coordinate conventions differ. Recenter events mark reference changes. Regular mode has view validity, not physical head tracking. |
| `display_state`, `detail` | Loading/preview/detail state or `sdk_managed`; short event reason. |

Pose samples target at most 20 Hz, with actual timestamps and no invented catch-up samples. Available controller poses are separate rows at the same sampling times. Discrete input, mode, movement, loading, tracking and lifecycle events are recorded when observed. No eye gaze or physiological measures are collected.

The custom Quest viewers log `load_start`, `preview_ready` and `detail_ready` separately. **The phone's Google viewer does not expose an exact image-ready timestamp**: `view_enter` is the SDK viewpoint-change event, and `sdk_status` reports SDK status. Its `display_state` is explicitly `sdk_managed`; do not treat those events as measured pixel-completion times. Regular-mode taps and swipes are raw pointer events; a `view_enter` confirms that navigation actually occurred.

Use `session_start`/`session_end`, `view_enter`/`view_leave`, `pose`, `move_request`/`move_accepted`/`move_blocked`, `input_down`/`input_up`, `mode_change`, `recenter`, visibility/tracking events and `csv_export` as appropriate. A CSV export is a snapshot, not a session-ending event. All downloaded files are analysis data, not panorama images or an offline Street View cache.

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
