import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../docs/vendor/three.module.min.js';
import { DEG, signedAngle, headingFromDirection, tileLayout } from '../docs/core.js';
import { alignHeadToStreet, headHeading, nextStreet, panoramaRotation, spherePoint, ControllerButtons, MovementGate } from '../docs/quest-controls.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test('entering VR aligns any starting head pose with the street, and head turns remain one-to-one', () => {
  for (const rawHeading of [0, 45, 180, 350]) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rawHeading * DEG);
    const offset = alignHeadToStreet(q, 270);
    close(signedAngle(headHeading(q, offset), 270), 0);
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(rawHeading + 45) * DEG);
    close(signedAngle(headHeading(turn, offset), 315), 0);
  }
});
test('panorama longitude is not mirrored and the metadata heading orients the image center', () => {
  close(headingFromDirection(spherePoint(.5, .5)), 0);
  close(headingFromDirection(spherePoint(.75, .5)), 90);
  close(headingFromDirection(spherePoint(.25, .5)), 270);
  const r = panoramaRotation({ heading: 123, tilt: 90, roll: 0 });
  const p = spherePoint(.5, .5, 1);
  const d = new THREE.Vector3(p.x, p.y, p.z).applyEuler(new THREE.Euler(r.x, r.y, r.z, 'YXZ'));
  close(headingFromDirection(d), 123);
});
test('panorama tilt levels the recorded horizon', () => {
  const metadata = { heading: 75, tilt: 87, roll: 0 };
  const p = spherePoint(.5, metadata.tilt / 180, 1), r = panoramaRotation(metadata);
  const d = new THREE.Vector3(p.x, p.y, p.z).applyEuler(new THREE.Euler(r.x, r.y, r.z, 'YXZ'));
  close(d.y, 0);
});
test('movement follows head direction, including wraparound and a three-way junction', () => {
  const links = [{ panoId: 'north', heading: 5 }, { panoId: 'east', heading: 90 }, { panoId: 'west', heading: 270 }];
  assert.equal(nextStreet(links, 355).panoId, 'north');
  assert.equal(nextStreet(links, 250).panoId, 'west');
  assert.equal(nextStreet(links, 180), null);
});
test('A/X is edge-triggered and does not repeat while held; B/Y exits', () => {
  const controller = { gamepad: { mapping: 'xr-standard', buttons: Array.from({ length: 6 }, () => ({ pressed: false })) } };
  const input = new ControllerButtons();
  assert.deepEqual(input.sample([controller]), { move: false, exit: false });
  controller.gamepad.buttons[4].pressed = true;
  assert.equal(input.sample([controller]).move, true);
  assert.equal(input.sample([controller]).move, false);
  controller.gamepad.buttons[4].pressed = false; input.sample([controller]);
  controller.gamepad.buttons[4].pressed = true;
  assert.equal(input.sample([controller]).move, true);
  controller.gamepad.buttons[5].pressed = true;
  assert.equal(input.sample([controller]).exit, true);
  assert.equal(input.sample([controller]).exit, false);
});
test('rapid presses cannot queue views, and a failed request allows retry', async () => {
  const gate = new MovementGate();
  let finish, calls = 0;
  const first = gate.run(() => new Promise(resolve => { calls++; finish = resolve; }), 0);
  assert.equal(await gate.run(() => { calls++; }, 1000), false);
  finish(); await first;
  await assert.rejects(gate.run(() => { throw new Error('network'); }, 1500));
  assert.equal(gate.busy, false);
  assert.equal(await gate.run(() => { calls++; }, 2000), true);
  assert.equal(calls, 2);
});
test('panorama textures remain within the Quest memory and texture limits', () => {
  const metadata = { imageWidth: 13312, imageHeight: 6656, tileWidth: 512, tileHeight: 512 };
  const high = tileLayout(metadata, 4), low = tileLayout(metadata, 3);
  assert.deepEqual([high.width, high.height, high.columns, high.rows], [6656, 3328, 13, 7]);
  assert.deepEqual([low.width, low.height, low.columns, low.rows], [3328, 1664, 7, 4]);
  assert.throws(() => tileLayout(metadata, 5));
});
