export const VERSION = '0.1.0';
export const DEG = Math.PI / 180;
export const wrap = value => ((value % 360) + 360) % 360;
export const signedAngle = (a, b) => ((a - b + 540) % 360 + 360) % 360 - 180;
export const headingFromDirection = ({ x, z }) => wrap(Math.atan2(x, -z) / DEG);
export const pitchFromDirection = ({ x, y, z }) => Math.atan2(y, Math.hypot(x, z)) / DEG;
export const directionForHeading = heading => ({ x: Math.sin(heading * DEG), z: -Math.cos(heading * DEG) });
export function selectForwardLink(links, heading, tolerance = 65) {
  let best = null;
  for (const link of links) {
    if (!Number.isFinite(link.heading)) continue;
    const error = Math.abs(signedAngle(link.heading, heading));
    if (error <= tolerance && (!best || error < best.error)) best = { ...link, error };
  }
  return best;
}
export function validateCoordinates(lat, lng) {
  if (String(lat).trim() === '' || String(lng).trim() === '') throw new Error('Enter both latitude and longitude.');
  lat = Number(lat); lng = Number(lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error('Use a latitude from −90 to 90 and longitude from −180 to 180.');
  return { lat, lng };
}
export function tileLayout(metadata, zoom = 3) {
  const { imageWidth, imageHeight, tileWidth = 512, tileHeight = 512 } = metadata;
  if (![imageWidth, imageHeight, tileWidth, tileHeight].every(v => Number.isFinite(v) && v > 0)) throw new Error('Street View returned invalid image dimensions.');
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 5) throw new Error('Invalid panorama quality.');
  // The maximum image is at zoom 5. Low zoom levels bottom out at one tile across.
  const scale = Math.max(1 / 2 ** (5 - zoom), tileWidth / imageWidth);
  const width = Math.ceil(imageWidth * scale), height = Math.ceil(imageHeight * scale);
  const columns = Math.ceil(width / tileWidth), rows = Math.ceil(height / tileHeight);
  if (width > 8192 || height > 4096 || columns * rows > 160) throw new Error('This panorama exceeds the prototype’s memory limit. Choose standard quality.');
  return { width, height, columns, rows, tileWidth, tileHeight };
}
export function safeReportURL(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
export function csvEscape(value) {
  if (value === undefined || value === null) return '';
  const string = String(value);
  return /[",\n\r]/.test(string) ? '"' + string.replaceAll('"', '""') + '"' : string;
}
export const CSV_COLUMNS = ['session_id', 'mode', 'source', 'type', 't_ms', 'view', 'heading_deg', 'pitch_deg', 'qx', 'qy', 'qz', 'qw', 'action', 'detail'];
export function sessionCSV(session) {
  return [CSV_COLUMNS.join(','), ...session.records.map(record => CSV_COLUMNS.map(key => csvEscape(key === 'session_id' ? session.id : key === 'mode' ? session.mode : key === 'source' ? session.source : record[key])).join(','))].join('\r\n');
}
export class SessionLog {
  constructor({ mode, source, now = performance.now(), utc = new Date().toISOString(), id = globalThis.crypto?.randomUUID?.() || String(Date.now()) }) {
    this.data = { schema_version: 1, app_version: VERSION, id, mode, source, started_utc: utc, pose_sample_target_hz: 20, duration_limit_s: 300, records: [], notes: 'Camera orientation is not eye gaze. View IDs are session-local. No imagery or API credentials are included.' };
    this.started = now;
    this.finished = false;
  }
  add(type, values = {}, now = performance.now()) {
    if (this.finished || this.data.records.length >= 12000) return;
    this.data.records.push({ type, t_ms: Math.round((now - this.started) * 10) / 10, ...values });
  }
  end(reason, now = performance.now()) {
    if (this.finished) return this.data;
    this.add('session_end', { detail: reason }, now);
    this.data.duration_ms = Math.round(now - this.started);
    this.data.end_reason = reason;
    this.finished = true;
    return this.data;
  }
}

