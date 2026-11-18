import * as THREE from './vendor/three.module.min.js';
import { DEG, headingFromDirection } from './core.js';

const BACK_OF_DEVICE = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3(0, 0, -1);
export function orientationQuaternion(alpha, beta, gamma, screenAngle = 0) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(beta * DEG, alpha * DEG, -gamma * DEG, 'YXZ'));
  q.multiply(BACK_OF_DEVICE);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -screenAngle * DEG));
  return q.normalize();
}
export function yawCalibration(raw, desiredHeading) {
  const heading = headingFromDirection(forward.clone().applyQuaternion(raw));
  return new THREE.Quaternion().setFromAxisAngle(Y_AXIS, (heading - desiredHeading) * DEG);
}
export class OrientationInput {
  constructor(onStatus) {
    this.raw = new THREE.Quaternion();
    this.offset = new THREE.Quaternion();
    this.quaternion = new THREE.Quaternion();
    this.lastReading = -Infinity;
    this.onStatus = onStatus;
    this.active = false;
    this.handler = event => {
      if (![event.alpha, event.beta, event.gamma].every(v => typeof v === 'number' && Number.isFinite(v))) return;
      this.raw.copy(orientationQuaternion(event.alpha, event.beta, event.gamma, screen.orientation?.angle ?? window.orientation ?? 0));
      this.lastReading = performance.now();
      if (this.waiting) { this.waiting(); this.waiting = null; }
      this.quaternion.copy(this.offset).multiply(this.raw);
    };
  }
  async start(heading) {
    if (!isSecureContext) throw new Error('Rotation needs HTTPS. Open the published link on your phone.');
    if (!globalThis.DeviceOrientationEvent) throw new Error('This browser does not expose orientation sensors. Try the phone’s Safari or Chrome browser.');
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') throw new Error('Motion permission was declined. Allow Motion & Orientation in the browser’s site settings, then retry.');
    }
    window.addEventListener('deviceorientation', this.handler);
    this.active = true;
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { this.waiting = null; reject(new Error('No orientation readings arrived. Check motion permissions and that this phone has a gyroscope.')); }, 6000);
        this.waiting = () => { clearTimeout(timeout); resolve(); };
      });
      this.calibrate(heading);
    } catch (error) { this.stop(); throw error; }
  }
  calibrate(heading) {
    this.offset.copy(yawCalibration(this.raw, heading));
    this.quaternion.copy(this.offset).multiply(this.raw);
  }
  get fresh() { return this.active && performance.now() - this.lastReading < 2000; }
  stop() { window.removeEventListener('deviceorientation', this.handler); this.active = false; this.waiting = null; }
}

