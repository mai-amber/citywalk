import { DEG, selectForwardLink, wrap } from './core.js';
import { povFromQuaternion } from './street-view-controls.js';

export function alignHeadToStreet(orientation, heading) {
  return (povFromQuaternion(orientation).heading - heading) * DEG;
}
export function headHeading(orientation, rigYaw) {
  return wrap(povFromQuaternion(orientation).heading - rigYaw / DEG);
}
export function nextStreet(links, heading) {
  return selectForwardLink((links || []).filter(link => link.panoId), heading, 55);
}
export function panoramaRotation({ heading = 0, tilt = 90, roll = 0 }) {
  return { x: (90 - tilt) * DEG, y: -heading * DEG, z: -roll * DEG };
}
export function spherePoint(u, v, radius = 500) {
  const longitude = (u - .5) * Math.PI * 2, latitude = (v - .5) * Math.PI;
  return { x: radius * Math.sin(longitude) * Math.cos(latitude), y: radius * Math.sin(latitude), z: -radius * Math.cos(longitude) * Math.cos(latitude) };
}

// Trigger events are handled by WebXR. Only poll the extra A/X and B/Y buttons.
export class ControllerButtons {
  constructor() { this.previous = new Map(); }
  sample(sources) {
    let move = false, exit = false;
    const active = new Set();
    for (const source of sources) {
      active.add(source);
      if (source.gamepad?.mapping !== 'xr-standard') continue;
      const buttons = source.gamepad.buttons;
      const now = [!!buttons[4]?.pressed, !!buttons[5]?.pressed];
      const before = this.previous.get(source) || [false, false];
      move ||= now[0] && !before[0];
      exit ||= now[1] && !before[1];
      this.previous.set(source, now);
    }
    for (const source of this.previous.keys()) if (!active.has(source)) this.previous.delete(source);
    return { move, exit };
  }
  reset() { this.previous.clear(); }
}

// No queued movement: holding or repeatedly pressing a button cannot skip views.
export class MovementGate {
  constructor() { this.busy = false; this.last = -Infinity; }
  async run(action, now = performance.now()) {
    if (this.busy || now - this.last < 350) return false;
    this.busy = true;
    this.last = now;
    try { await action(); return true; } finally { this.busy = false; }
  }
}
