import { headingFromDirection, pitchFromDirection } from './core.js';

// Rotate the camera forward vector (0, 0, -1) using the existing gyro quaternion.
// Google uses clockwise-from-north headings and positive-up pitch, in degrees.
export function povFromQuaternion({ x, y, z, w }, previousHeading = 0) {
  const direction = { x: -2 * (x * z + w * y), y: 2 * (w * x - y * z), z: 2 * (x * x + y * y) - 1 };
  return {
    heading: Math.hypot(direction.x, direction.z) < 1e-6 ? previousHeading : headingFromDirection(direction),
    pitch: Math.max(-90, Math.min(90, pitchFromDirection(direction))),
  };
}
