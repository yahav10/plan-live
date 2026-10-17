import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, rubberband, resist, releaseVelocity, decayed } from '../../ui/components/momentum.mjs';

test('projection throws a flick forward with exponential decay, not v²/2a', () => {
  assert.equal(Math.round(project(1000)), 499);
  assert.equal(project(0), 0);
  assert.equal(Math.round(project(-1000)), -499);
  assert.ok(project(1000, 0.99) < project(1000, 0.998));
});

test('rubberband resists more the further past the edge, and never exceeds the dimension', () => {
  assert.equal(rubberband(0, 400), 0);
  const near = rubberband(20, 400), far = rubberband(400, 400), huge = rubberband(1e6, 400);
  assert.ok(near > 0 && near < 20);
  assert.ok(far > near && far < 400);
  assert.ok(huge < 400 * 1.01);
  assert.ok(far / 400 < near / 20, 'resistance grows with distance');
});

test('resist leaves values inside the bounds alone and pulls outside ones back toward them', () => {
  assert.equal(resist(50, 0, 100, 400), 50);
  assert.ok(resist(-30, 0, 100, 400) < 0 && resist(-30, 0, 100, 400) > -30);
  assert.ok(resist(160, 0, 100, 400) > 100 && resist(160, 0, 100, 400) < 160);
});

test('release velocity comes from the last 100 ms of pointer history only', () => {
  const hist = [{ t: 0, x: 0, y: 0 }, { t: 400, x: 500, y: 0 }, { t: 450, x: 510, y: 0 }, { t: 500, x: 530, y: 20 }];
  const v = releaseVelocity(hist, 500);
  assert.equal(Math.round(v.x), 300);
  assert.equal(Math.round(v.y), 200);
  assert.deepEqual(releaseVelocity([{ t: 0, x: 0, y: 0 }], 500), { x: 0, y: 0 });
  assert.deepEqual(releaseVelocity([{ t: 0, x: 0, y: 0 }, { t: 10, x: 50, y: 0 }], 1000), { x: 0, y: 0 }, 'a pointer that stopped does not fling');
});

test('velocity decays by the same factor per frame whatever the frame length', () => {
  const once = decayed(1000, 32), twice = decayed(decayed(1000, 16), 16);
  assert.ok(Math.abs(once - twice) < 1e-6);
  assert.ok(once < 1000 && once > 0);
});
