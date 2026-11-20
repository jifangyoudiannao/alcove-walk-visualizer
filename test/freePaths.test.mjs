import test from 'node:test';
import assert from 'node:assert/strict';
import {A0, center, neighborAcross} from '../dist/js/math/affineA2.js';
import {Walk} from '../dist/js/math/walk.js';
import {FreePaths} from '../dist/js/math/freePaths.js';

test('a free fold on any wall keeps the actual alcove and drawing point, and consumes one step', () => {
  const walk = new Walk();
  const adjacent = neighborAcross(A0, 1);
  const point = center(adjacent);
  point.u += 0.02;
  walk.append(adjacent, point);
  for (const wall of [0, 1, 2, 2]) {
    const before = walk.steps;
    assert.equal(walk.fold(wall), true);
    assert.equal(walk.steps, before + 1);
    const step = walk.nodes.at(-1);
    assert.deepEqual(step, {alcove: adjacent, point, via: wall, action: 'fold'});
  }
  assert.equal(walk.distinct, 2);
  assert.deepEqual(walk.word, [1, 0, 1, 2, 2]);
  assert.deepEqual(walk.crossingWord, [1]);
  assert.ok(walk.append(neighborAcross(adjacent, 0)));
  assert.deepEqual(walk.crossingWord, [1, 0]);
  assert.equal(walk.nodes.at(-1).action, 'cross');
});

test('free paths start independently at A₀ and keep separate edit histories and colors', () => {
  const drawing = new FreePaths();
  const first = drawing.active;
  first.walk.setWord([1, 2]);
  first.walk.fold(0);
  const second = drawing.add();
  assert.equal(drawing.active, second);
  assert.deepEqual(second.walk.current, A0);
  second.walk.fold(1);
  assert.equal(second.walk.undo(), true);
  assert.equal(drawing.select(first.id), true);
  assert.equal(drawing.select(0), false);
  assert.equal(drawing.active, first);
  assert.equal(first.walk.undo(), true);
  assert.deepEqual(first.walk.word, [1, 2]);
  assert.equal(first.walk.redo(), true);
  assert.equal(first.walk.nodes.at(-1).action, 'fold');
  assert.equal(second.walk.steps, 0);
  assert.equal(second.walk.redo(), true);
  for (let i = 0; i < 20; i++) drawing.add();
  const colors = drawing.paths.map(path => path.color);
  assert.equal(new Set(colors).size, colors.length);
  for (const wallColor of ['#709967', '#cb8290', '#6798bf']) assert.ok(!colors.includes(wallColor));
});

test('a multi-path drawing round-trips all folds, points, selection, and path colors', () => {
  const drawing = new FreePaths();
  const adjacent = neighborAcross(A0, 0);
  const point = center(adjacent);
  point.v -= 0.03;
  drawing.active.walk.append(adjacent, point);
  drawing.active.walk.fold(2);
  drawing.add().walk.fold(1);
  drawing.select(1);
  const restored = new FreePaths();
  assert.equal(restored.restore(drawing.serialize()), true);
  assert.deepEqual(restored.toJSON(), drawing.toJSON());
  assert.deepEqual(restored.paths.map(p => p.color), drawing.paths.map(p => p.color));
  assert.equal(restored.active.id, 1);
  assert.deepEqual(restored.active.walk.current, adjacent);
  assert.equal(restored.add().id, 3);
});

test('old crossing-only saves migrate to path 1 in raw and camera-wrapped formats', () => {
  const next = neighborAcross(A0, 2);
  const oldNodes = [
    {alcove: A0, point: center(A0), via: null},
    {alcove: next, point: center(next), via: 2},
  ];
  for (const saved of [oldNodes, {nodes: oldNodes, camera: {}, snap: true}]) {
    const drawing = new FreePaths();
    drawing.add().walk.fold(0);
    assert.equal(drawing.restore(JSON.stringify(saved)), true);
    assert.equal(drawing.paths.length, 1);
    assert.equal(drawing.active.id, 1);
    assert.deepEqual(drawing.active.walk.current, next);
    assert.equal(drawing.active.walk.nodes[1].action, 'cross');
    drawing.active.walk.fold(1);
    assert.deepEqual(drawing.active.walk.crossingWord, [2]);
  }
});

test('malformed saved paths and selections are rejected without partially replacing a drawing', () => {
  const drawing = new FreePaths();
  drawing.active.walk.setWord([1, 0]);
  drawing.add().walk.fold(2);
  const saved = drawing.serialize();
  for (const corrupt of [
    state => { state.activeId = 0; },
    state => { state.paths[1].id = 1; },
    state => { state.paths[1].nodes.at(-1).via = 3; },
    state => { state.paths[1].nodes.at(-1).point.u += 0.2; },
    state => { state.paths[1].nodes.at(-1).action = 'cross'; },
    state => { state.paths[0].nodes[1].action = 'fold'; },
    state => { delete state.paths[0].nodes[1].via; },
    state => { state.paths[0].nodes[2] = null; },
  ]) {
    const data = JSON.parse(saved);
    corrupt(data);
    assert.equal(drawing.restore(JSON.stringify(data)), false);
    assert.equal(drawing.serialize(), saved);
  }
});

test('Clear All Paths removes every stroke, fold and edit history and opens a blank first path', () => {
  const drawing = new FreePaths();
  drawing.active.walk.fold(0);
  drawing.add().walk.setWord([1, 2, 1]);
  drawing.clearAll();
  assert.deepEqual(drawing.toJSON(), new FreePaths().toJSON());
  assert.equal(drawing.active.walk.undo(), false);
  assert.equal(drawing.active.walk.redo(), false);
  drawing.active.walk.fold(1);
  assert.equal(drawing.active.walk.steps, 1);
});
