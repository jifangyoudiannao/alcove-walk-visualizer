import test from 'node:test';
import assert from 'node:assert/strict';
import { A0, alcoveKey, edges, sameAlcove } from '../dist/js/math/affineA2.js';
import { reducedGallery, crossingSign, FoldFamily } from '../dist/js/math/folded.js';

// Independent lattice adjacency for the breadth-first shortest-distance oracle.
function neighbors(a) {
  const { i, j, half } = a;
  return half === 'L'
    ? [{ i: i - 1, j, half: 'U' }, { i, j: j - 1, half: 'U' }, { i, j, half: 'U' }]
    : [{ i: i + 1, j, half: 'L' }, { i, j: j + 1, half: 'L' }, { i, j, half: 'L' }];
}

function distancesWithin(radius) {
  const distances = new Map([[alcoveKey(A0), 0]]);
  const queue = [A0];
  for (let head = 0; head < queue.length; head++) {
    const a = queue[head], d = distances.get(alcoveKey(a));
    if (d === radius) continue;
    for (const b of neighbors(a)) {
      const key = alcoveKey(b);
      if (!distances.has(key)) { distances.set(key, d + 1); queue.push(b); }
    }
  }
  return distances;
}

// Determine orientation geometrically, rather than using the engine's sign rule.
function sideOfWall(a, wall) {
  const offset = a.half === 'L' ? 1 / 3 : 2 / 3;
  const x = a.i + offset, y = a.j + offset;
  if (wall.start.x === wall.end.x) return Math.sign(x - wall.start.x);
  if (wall.start.y === wall.end.y) return Math.sign(y - wall.start.y);
  return Math.sign(x + y - wall.start.x - wall.start.y);
}

function referencePaths(gallery, rule) {
  const result = [];
  function visit(k, a, actions, nodes) {
    if (k === gallery.word.length) {
      result.push({ actions, nodes });
      return;
    }
    const wall = edges(a).find(e => e.type === gallery.word[k]);
    const side = sideOfWall(a, wall);
    visit(k + 1, wall.adjacent, actions + 'C', [...nodes, wall.adjacent]);
    if (rule === 'all' || (rule === 'positive' ? side === 1 : side === gallery.signs[k])) {
      visit(k + 1, a, actions + 'F', [...nodes, a]);
    }
  }
  visit(0, A0, '', [A0]);
  return result;
}

function actions(path) { return path.steps.map(s => s.kind === 'fold' ? 'F' : 'C').join(''); }

function assertPathGeometry(path, gallery) {
  assert.equal(path.nodes.length, gallery.word.length + 1);
  assert.equal(path.steps.length, gallery.word.length);
  assert.ok(sameAlcove(path.nodes[0], A0));
  for (let k = 0; k < path.steps.length; k++) {
    const step = path.steps[k];
    assert.equal(step.type, gallery.word[k]);
    assert.deepEqual(step.from, path.nodes[k]);
    assert.deepEqual(step.to, path.nodes[k + 1]);
    const wall = edges(step.from).find(e => e.type === step.type);
    assert.deepEqual(step.wall, wall);
    assert.equal(step.sign, sideOfWall(step.from, wall) * (step.kind === 'fold' ? 1 : -1));
    assert.deepEqual(step.to, step.kind === 'fold' ? step.from : wall.adjacent);
  }
  assert.equal(path.folds, path.steps.filter(s => s.kind === 'fold').length);
  assert.equal(path.positiveFolds, path.steps.filter(s => s.kind === 'fold' && s.sign === 1).length);
  assert.equal(path.negativeFolds, path.steps.filter(s => s.kind === 'fold' && s.sign === -1).length);
  assert.equal(path.positiveFolds + path.negativeFolds, path.folds);
}

test('weight targets and reduced galleries agree with independent breadth-first distances', () => {
  const distances = distancesWithin(16);
  for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) {
    const gallery = reducedGallery({ a, b });
    const target = { i: -a, j: -b, half: 'L' };
    const distance = distances.get(alcoveKey(target));
    assert.ok(sameAlcove(gallery.target, target));
    assert.equal(gallery.word.length, distance);
    assert.equal(gallery.word.length, Math.abs(a) + Math.abs(b) + Math.abs(a + b));
    assert.equal(gallery.nodes.length, distance + 1);
    assert.ok(sameAlcove(gallery.nodes[0], A0));
    assert.ok(sameAlcove(gallery.nodes.at(-1), target));
    for (let k = 0; k < distance; k++) {
      const wall = edges(gallery.nodes[k]).find(e => e.type === gallery.word[k]);
      assert.deepEqual(wall.adjacent, gallery.nodes[k + 1]);
      assert.equal(gallery.signs[k], -sideOfWall(gallery.nodes[k], wall));
    }
    assert.deepEqual(reducedGallery({ a, b }), gallery, 'reduced gallery must be deterministic');
  }
});

test('fundamental weights outside the root lattice and zero weight are valid', () => {
  for (const weight of [{ a: 1, b: 0 }, { a: 0, b: 1 }, { a: -1, b: 0 }]) {
    const gallery = reducedGallery(weight);
    assert.equal(gallery.word.length, 2);
    assert.ok(sameAlcove(gallery.target, { i: -weight.a, j: -weight.b, half: 'L' }));
  }
  const zero = reducedGallery({ a: 0, b: 0 });
  assert.deepEqual(zero.word, []);
  for (const rule of ['all', 'positive', 'ram']) {
    const family = new FoldFamily(zero, rule);
    assert.equal(family.total, 1n);
    assertPathGeometry(family.pathAt(0n), zero);
  }
});

test('weight validation rejects nonintegral, unsafe and overly long inputs', () => {
  for (const bad of [0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1']) {
    assert.throws(() => reducedGallery({ a: bad, b: 0 }));
    assert.throws(() => reducedGallery({ a: 0, b: bad }));
  }
  assert.throws(() => reducedGallery({ a: 16, b: 15 }));
  assert.throws(() => reducedGallery({ a: Number.MAX_SAFE_INTEGER, b: 0 }));
  assert.equal(reducedGallery({ a: 15, b: 15 }).word.length, 60);
});

test('crossing orientations reverse across every wall and match its geometric half-space', () => {
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (const half of ['L', 'U']) {
    const alcove = { i, j, half };
    for (const wall of edges(alcove)) {
      const sign = crossingSign(alcove, wall.type);
      assert.equal(sign, -sideOfWall(alcove, wall));
      assert.equal(crossingSign(wall.adjacent, wall.type), -sign);
    }
  }
});

test('all indexed families agree with exhaustive geometric branching on small signed weights', () => {
  const weights = [{ a: 1, b: 0 }, { a: 1, b: 1 }, { a: 2, b: 1 },
    { a: -1, b: -1 }, { a: 2, b: -1 }, { a: -1, b: 2 }, { a: 0, b: -2 }];
  for (const weight of weights) {
    const gallery = reducedGallery(weight);
    for (const rule of ['all', 'positive', 'ram']) {
      const expected = referencePaths(gallery, rule);
      const family = new FoldFamily(gallery, rule);
      assert.equal(family.total, BigInt(expected.length), `${JSON.stringify(weight)} ${rule}`);
      for (let k = 0; k < expected.length; k++) {
        const path = family.pathAt(BigInt(k));
        assert.equal(actions(path), expected[k].actions);
        assert.deepEqual(path.nodes, expected[k].nodes);
        assertPathGeometry(path, gallery);
      }
      assert.throws(() => family.pathAt(-1n));
      assert.throws(() => family.pathAt(family.total));
    }
  }
});

test('Ram section 3.2 with initial direction e has no first fold', () => {
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
    const gallery = reducedGallery({ a, b });
    const family = new FoldFamily(gallery, 'ram');
    assert.equal(family.total, 1n);
    assert.equal(family.pathAt(0n).folds, 0);
    assert.deepEqual(family.pathAt(0n).nodes, gallery.nodes);
  }
});

test('folded paths retain wall type but recalculate the physical wall after a fold', () => {
  const gallery = reducedGallery({ a: 2, b: 1 });
  const family = new FoldFamily(gallery, 'all');
  const firstFoldThenCross = family.pathAt(1n << BigInt(gallery.word.length - 1));
  assert.equal(actions(firstFoldThenCross), 'F' + 'C'.repeat(gallery.word.length - 1));
  assert.ok(sameAlcove(firstFoldThenCross.nodes[0], firstFoldThenCross.nodes[1]));
  assert.equal(firstFoldThenCross.steps[1].type, gallery.word[1]);
  const originalSecondWall = edges(gallery.nodes[1]).find(e => e.type === gallery.word[1]);
  assert.notEqual(firstFoldThenCross.steps[1].wall.equation, originalSecondWall.equation);
  assertPathGeometry(firstFoldThenCross, gallery);
});

test('different fold choices remain distinct even when they end in the same alcove', () => {
  const gallery = reducedGallery({ a: 2, b: 1 });
  const family = new FoldFamily(gallery, 'all');
  const signatures = new Set(), endpoints = new Map();
  for (let k = 0n; k < family.total; k++) {
    const path = family.pathAt(k), key = alcoveKey(path.nodes.at(-1));
    signatures.add(actions(path));
    endpoints.set(key, (endpoints.get(key) ?? 0) + 1);
  }
  assert.equal(BigInt(signatures.size), family.total);
  assert.ok([...endpoints.values()].some(count => count > 1));
});

test('large all-fold families have exact BigInt counts and direct random access', () => {
  const gallery = reducedGallery({ a: 15, b: 15 });
  const family = new FoldFamily(gallery, 'all');
  assert.equal(family.total, 1n << 60n);
  for (const index of [0n, 1n, 123456789012345678n, family.total / 2n, family.total - 1n]) {
    const path = family.pathAt(index);
    const reconstructedIndex = path.steps.reduce((value, step) => value * 2n + (step.kind === 'fold' ? 1n : 0n), 0n);
    assert.equal(reconstructedIndex, index);
    assertPathGeometry(path, gallery);
  }
  assert.deepEqual(family.pathAt(0n).nodes, gallery.nodes);
  const allFolds = family.pathAt(family.total - 1n);
  assert.equal(allFolds.folds, 60);
  assert.ok(allFolds.nodes.every(a => sameAlcove(a, A0)));
});

test('positive-fold dynamic counts support random-access paths beyond tiny examples', () => {
  const gallery = reducedGallery({ a: 5, b: 4 });
  const family = new FoldFamily(gallery, 'positive');
  assert.ok(family.total > 1n);
  assert.ok(family.total <= (1n << BigInt(gallery.word.length)));
  for (const index of [0n, family.total / 2n, family.total - 1n]) {
    const path = family.pathAt(index);
    assert.equal(path.negativeFolds, 0);
    assertPathGeometry(path, gallery);
  }
});
