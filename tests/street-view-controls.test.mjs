import test from 'node:test';
import assert from 'node:assert/strict';
import { orientationQuaternion, yawCalibration } from '../docs/sensors.js';
import { povFromQuaternion } from '../docs/street-view-controls.js';
import { selectForwardLink, signedAngle } from '../docs/core.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const headingNear = (actual, expected) => near(signedAngle(actual, expected), 0);

test('upright phone preserves the four compass directions in Street View', () => {
  for (const [alpha, heading] of [[0, 0], [270, 90], [180, 180], [90, 270]]) {
    const pov = povFromQuaternion(orientationQuaternion(alpha, 90, 0));
    headingNear(pov.heading, heading);
    near(pov.pitch, 0);
  }
});

test('looking up and down uses Google positive-up pitch', () => {
  for (const pitch of [-60, -30, 0, 30, 60]) {
    const pov = povFromQuaternion(orientationQuaternion(0, 90 + pitch, 0));
    headingNear(pov.heading, 0);
    near(pov.pitch, pitch);
  }
});

test('gyro calibration joins the current touch heading without changing tilt', () => {
  for (const heading of [0, 89, 181, 270, 359]) {
    const raw = orientationQuaternion(42, 110, 0);
    const calibrated = yawCalibration(raw, heading).multiply(raw);
    const pov = povFromQuaternion(calibrated);
    headingNear(pov.heading, heading);
    near(pov.pitch, 20);
  }
});

test('portrait and landscape screen rotations keep the same pointing direction', () => {
  const expected = povFromQuaternion(orientationQuaternion(270, 100, 20, 0));
  for (const screenAngle of [-90, 90, 180]) {
    const pov = povFromQuaternion(orientationQuaternion(270, 100, 20, screenAngle));
    headingNear(pov.heading, expected.heading);
    near(pov.pitch, expected.pitch);
  }
});

test('vertical phone tilt retains the last defined heading', () => {
  const pov = povFromQuaternion(orientationQuaternion(0, 180, 0), 123);
  near(pov.heading, 123);
  near(pov.pitch, 90);
});

test('gyro Forward chooses the nearest linked street across north and rejects behind', () => {
  const links = [{ pano: 'north', heading: 2 }, { pano: 'east', heading: 90 }, { pano: 'south', heading: 180 }];
  assert.equal(selectForwardLink(links, 358, 55).pano, 'north');
  assert.equal(selectForwardLink(links, 270, 55), null);
  assert.equal(selectForwardLink([], 0, 55), null);
});
