import test from 'node:test';
import assert from 'node:assert/strict';
import { A0, alcoveKey, edges, sameAlcove, wordToAlcove } from '../dist/js/math/affineA2.js';
import { ramReference, ramChoices, RamWalk, RamFamily, FINITE_STARTS, describeRamPath } from '../dist/js/math/ram.js';

// Integer-valued side oracle at three times the alcove barycenter. This does
// not use crossingSign or any Ram engine orientation/branching routine.
function geometricSide(alcove, wall) {
  const t = alcove.half === 'L' ? 1 : 2;
  const x3 = 3 * alcove.i + t, y3 = 3 * alcove.j + t;
  if (wall.start.x === wall.end.x) return Math.sign(x3 - 3 * wall.start.x);
  if (wall.start.y === wall.end.y) return Math.sign(y3 - 3 * wall.start.y);
  return Math.sign(x3 + y3 - 3 * (wall.start.x + wall.start.y));
}

function bruteForce(reference, start) {
  const result = [];
  function dfs(position, current, actions, nodes) {
    if (position === reference.word.length) { result.push({ actions, nodes }); return; }
    const wall = edges(current).find(e => e.type === reference.word[position]);
    dfs(position + 1, wall.adjacent, [...actions, 'cross'], [...nodes, wall.adjacent]);
    if (geometricSide(current, wall) === reference.signs[position]) {
      dfs(position + 1, current, [...actions, 'fold'], [...nodes, current]);
    }
  }
  dfs(0, start, [], [start]);
  return result;
}

function pathActions(path) { return path.steps.map(step => step.kind); }
function actionWord(path) { return pathActions(path).map(kind => kind === 'cross' ? 'C' : 'F').join(''); }
function startByWord(word) { return FINITE_STARTS.find(start => start.word.join('') === word).alcove; }

function assertRamPath(path, reference, start) {
  assert.deepEqual(path.nodes[0], start);
  assert.equal(path.nodes.length, reference.word.length + 1);
  assert.equal(path.steps.length, reference.word.length);
  path.steps.forEach((step, k) => {
    const wall = edges(path.nodes[k]).find(e => e.type === reference.word[k]);
    assert.equal(step.index, k + 1);
    assert.equal(step.type, reference.word[k]);
    assert.deepEqual(step.from, path.nodes[k]);
    assert.deepEqual(step.to, path.nodes[k + 1]);
    assert.deepEqual(step.wall, wall);
    const side = geometricSide(step.from, wall);
    if (step.kind === 'fold') {
      assert.equal(side, reference.signs[k], 'fold must have the reference sign');
      assert.equal(step.sign, side);
      assert.deepEqual(step.to, step.from, 'fold retains the same alcove');
    } else {
      assert.equal(step.sign, -side);
      assert.deepEqual(step.to, wall.adjacent, 'crossing goes to the unique adjacent alcove');
      assert.equal(geometricSide(step.to, wall), -side);
    }
  });
  assert.equal(path.folds, path.steps.filter(s => s.kind === 'fold').length);
  assert.equal(path.positiveFolds, path.steps.filter(s => s.kind === 'fold' && s.sign === 1).length);
  assert.equal(path.negativeFolds, path.steps.filter(s => s.kind === 'fold' && s.sign === -1).length);
  assert.equal(path.positiveFolds + path.negativeFolds, path.folds);
}

test('Ram references use A0 + lambda and permit every integral A2 weight', () => {
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
    const ref = ramReference({ a, b });
    assert.ok(sameAlcove(ref.target, { i: a, j: b, half: 'L' }));
    assert.deepEqual(ref.weight, { a, b });
    assert.equal(ref.word.length, Math.abs(a) + Math.abs(b) + Math.abs(a + b));
    assert.deepEqual(ref.nodes[0], A0);
    assert.deepEqual(ref.nodes.at(-1), ref.target);
    ref.word.forEach((type, k) => {
      const wall = edges(ref.nodes[k]).find(e => e.type === type);
      assert.deepEqual(ref.nodes[k + 1], wall.adjacent);
      assert.equal(ref.signs[k], -geometricSide(ref.nodes[k], wall));
    });
  }
  assert.equal(ramReference({ a: 1, b: 0 }).word.length, 2, 'fundamental weights need not lie in the root lattice');
});

test('reference validation rejects nonreduced, wrong-target and nonintegral inputs', () => {
  const ref = ramReference({ a: 1, b: 1 });
  assert.deepEqual(ramReference({ a: 1, b: 1 }, ref.word).nodes, ref.nodes);
  // Both sides of the A2 braid after s0 reach the same translated alcove.
  const alternate = ramReference({ a: 1, b: 1 }, [0, 2, 1, 2]);
  assert.deepEqual(alternate.target, ref.target);
  assert.throws(() => ramReference({ a: 1, b: 1 }, [0, 0, ...ref.word]));
  assert.throws(() => ramReference({ a: 1, b: 1 }, [0, 1]));
  assert.throws(() => ramReference({ a: 1, b: 1 }, [0, 4, 1, 2]));
  assert.throws(() => ramReference({ a: 0, b: 0 }, [1, 1]));
  for (const bad of [0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1']) {
    assert.throws(() => ramReference({ a: bad, b: 0 }));
  }
  assert.throws(() => ramReference({ a: 16, b: 15 }));
});

test('all six finite starting alcoves agree with their Coxeter words', () => {
  assert.deepEqual(FINITE_STARTS.map(s => s.word.join('')).sort(), ['', '1', '12', '121', '2', '21'].sort());
  assert.equal(new Set(FINITE_STARTS.map(s => alcoveKey(s.alcove))).size, 6);
  for (const start of FINITE_STARTS) assert.deepEqual(start.alcove, wordToAlcove(start.word));
});

test('Ram choices implement every reference-sign/current-side case independently of wall type', () => {
  const observed = new Set();
  for (const weight of [{ a: 1, b: 1 }, { a: -1, b: -1 }]) {
    const ref = ramReference(weight);
    for (let k = 0; k < ref.word.length; k++) {
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const half of ['L', 'U']) {
        const a = { i, j, half }, wall = edges(a).find(e => e.type === ref.word[k]);
        const side = geometricSide(a, wall), choice = ramChoices(ref, k, a);
        assert.deepEqual(choice.wall, wall);
        assert.equal(choice.side, side);
        assert.equal(choice.referenceSign, ref.signs[k]);
        assert.equal(choice.crossingSign, -side);
        assert.equal(choice.canFold, side === ref.signs[k]);
        observed.add(`${ref.signs[k]}:${side}:${ref.word[k]}`);
      }
    }
  }
  assert.equal(observed.size, 12, 'all four cases are exercised for all three wall types');
});

test('memoized enumeration agrees with independent DFS for signed weights and every finite start', () => {
  const weights = [{ a: 0, b: 0 }, { a: 1, b: 0 }, { a: 0, b: 1 }, { a: 1, b: 1 },
    { a: 2, b: 1 }, { a: -1, b: -1 }, { a: 1, b: -1 }, { a: -1, b: 2 }];
  for (const weight of weights) for (const start of FINITE_STARTS) {
    const ref = ramReference(weight), expected = bruteForce(ref, start.alcove);
    const family = new RamFamily(ref, start.alcove);
    assert.equal(family.total, BigInt(expected.length), `${JSON.stringify(weight)} from ${start.id}`);
    for (let i = 0; i < expected.length; i++) {
      const path = family.pathAt(BigInt(i));
      assert.deepEqual(pathActions(path), expected[i].actions);
      assert.deepEqual(path.nodes, expected[i].nodes);
      assertRamPath(path, ref, start.alcove);
    }
    assert.throws(() => family.pathAt(-1n));
    assert.throws(() => family.pathAt(family.total));
  }
});

test('manual selections produce exactly the enumerated path and reject every forbidden fold', () => {
  for (const weight of [{ a: 1, b: 1 }, { a: -1, b: -1 }, { a: 1, b: -1 }]) {
    for (const start of FINITE_STARTS) {
      const ref = ramReference(weight), family = new RamFamily(ref, start.alcove);
      for (let index = 0n; index < family.total; index++) {
        const expected = family.pathAt(index), manual = new RamWalk(ref, start.alcove);
        expected.steps.forEach((step, k) => {
          assert.equal(manual.position, k);
          assert.deepEqual(manual.current, expected.nodes[k]);
          if (!manual.next.canFold) {
            const before = JSON.stringify(manual.path);
            assert.throws(() => manual.step('fold'));
            assert.equal(JSON.stringify(manual.path), before, 'illegal action must not mutate the walk');
          }
          manual.step(step.kind);
        });
        assert.equal(manual.complete, true);
        assert.equal(manual.next, null);
        assert.deepEqual(manual.path, expected);
        assert.throws(() => manual.step('cross'));
        const loaded = new RamWalk(ref, start.alcove);
        loaded.loadActions(pathActions(expected));
        assert.deepEqual(loaded.path, expected);
      }
    }
  }
});

test('folds keep the current alcove and subsequent walls are found there', () => {
  const ref = ramReference({ a: 1, b: 1 }), start = startByWord('121');
  const family = new RamFamily(ref, start);
  const paths = Array.from({ length: Number(family.total) }, (_, i) => family.pathAt(BigInt(i)));
  const folded = paths.find(p => p.steps[0].kind === 'fold');
  const crossed = paths.find(p => p.steps[0].kind === 'cross');
  assert.ok(folded && crossed);
  assert.deepEqual(folded.nodes[0], folded.nodes[1]);
  assert.equal(folded.steps[1].type, crossed.steps[1].type);
  assert.notEqual(folded.steps[1].wall.equation, crossed.steps[1].wall.equation);
  assertRamPath(folded, ref, start);
});

test('dominant positive folding allows negative crossings but never negative folds', () => {
  let foundNegativeCrossing = false, foundFold = false;
  for (const weight of [{ a: 1, b: 0 }, { a: 1, b: 1 }, { a: 2, b: 1 }]) {
    const ref = ramReference(weight);
    assert.ok(ref.signs.every(sign => sign === 1));
    for (const start of FINITE_STARTS) {
      const family = new RamFamily(ref, start.alcove, true);
      assert.equal(family.total, new RamFamily(ref, start.alcove).total);
      for (let i = 0n; i < family.total; i++) {
        const path = family.pathAt(i);
        assert.equal(path.negativeFolds, 0);
        foundFold ||= path.folds > 0;
        foundNegativeCrossing ||= path.steps.some(s => s.kind === 'cross' && s.sign === -1);
        const manual = new RamWalk(ref, start.alcove, true);
        manual.loadActions(pathActions(path));
        assert.deepEqual(manual.path, path);
      }
    }
  }
  assert.ok(foundNegativeCrossing);
  assert.ok(foundFold);
  const negativeReference = ramReference({ a: -1, b: 0 });
  assert.throws(() => new RamFamily(negativeReference, A0, true));
  assert.throws(() => new RamWalk(negativeReference, A0, true));
});

test('nontrivial initial direction creates branches and same-endpoint walks stay distinct', () => {
  const ref = ramReference({ a: 1, b: 1 });
  const family = new RamFamily(ref, startByWord('121'));
  assert.equal(family.total, 8n);
  const paths = Array.from({ length: 8 }, (_, i) => family.pathAt(BigInt(i)));
  assert.equal(new Set(paths.map(actionWord)).size, 8);
  assert.equal(new Set(paths.map(p => alcoveKey(p.nodes.at(-1)))).size, 7);
  const identity = new RamFamily(ref, A0);
  assert.equal(identity.total, 1n);
  assert.deepEqual(identity.pathAt(0n).nodes, ref.nodes);
});

test('undo, reset and empty references preserve the chosen initial alcove', () => {
  const start = startByWord('121'), ref = ramReference({ a: 1, b: 1 });
  const walk = new RamWalk(ref, start);
  assert.equal(walk.undo(), false);
  walk.step('fold');
  assert.equal(walk.position, 1);
  assert.deepEqual(walk.current, start);
  assert.equal(walk.undo(), true);
  assert.equal(walk.position, 0);
  walk.step('cross'); walk.reset();
  assert.equal(walk.position, 0);
  assert.deepEqual(walk.path.nodes, [start]);
  assert.equal(walk.path.folds, 0);
  const zero = ramReference({ a: 0, b: 0 });
  const empty = new RamWalk(zero, start, true);
  assert.equal(empty.complete, true);
  assert.equal(empty.next, null);
  assert.equal(new RamFamily(zero, start, true).total, 1n);
  assert.deepEqual(new RamFamily(zero, start, true).pathAt(0n).nodes, [start]);
});

test('exported records retain walls, fold positions, signs and Ram coefficients', () => {
  for (const weight of [{ a: 1, b: 1 }, { a: -1, b: -1 }, { a: 1, b: -1 }]) {
    const ref = ramReference(weight), start = startByWord('121'), family = new RamFamily(ref, start);
    for (let i = 0n; i < family.total; i++) {
      const path = family.pathAt(i), data = describeRamPath(ref, start, path);
      assert.deepEqual(data.reference.word, ref.word);
      assert.deepEqual(data.reference.signs, ref.signs);
      assert.deepEqual(data.initialAlcove, start);
      assert.deepEqual(data.currentAlcove, path.nodes.at(-1));
      assert.deepEqual(data.finalAlcove, path.nodes.at(-1));
      assert.equal(data.complete, true);
      assert.deepEqual(data.foldingPositions, path.steps.filter(s => s.kind === 'fold').map(s => s.index));
      assert.equal(data.positiveFolds, path.positiveFolds);
      assert.equal(data.negativeFolds, path.negativeFolds);
      assert.equal(data.totalFolds, path.folds);
      assert.equal(data.coefficient.sign, path.negativeFolds % 2 === 0 ? 1 : -1);
      assert.equal(data.coefficient.power, path.folds);
      assert.ok(data.coefficient.expression.length > 0);
      data.steps.forEach((step, k) => {
        assert.equal(step.referenceSign, ref.signs[k]);
        assert.equal(step.side, geometricSide(step.from, step.wall));
      });
      assert.doesNotThrow(() => JSON.stringify(data));
    }
    const incomplete = new RamWalk(ref, start);
    const partial = describeRamPath(ref, start, incomplete.path);
    assert.equal(partial.complete, false);
    assert.equal(partial.finalAlcove, null);
    assert.equal(partial.coefficient.expression, '1');
  }
});

test('large dominant reference supports exact indexing without exhaustive materialization', () => {
  const ref = ramReference({ a: 15, b: 15 }), start = startByWord('121');
  assert.equal(ref.word.length, 60);
  const family = new RamFamily(ref, start, true);
  assert.ok(family.total > 1n);
  assert.ok(family.total <= 1n << 60n);
  for (const index of [0n, family.total / 2n, family.total - 1n]) {
    const path = family.pathAt(index);
    assertRamPath(path, ref, start);
    const manual = new RamWalk(ref, start, true);
    manual.loadActions(pathActions(path));
    assert.deepEqual(manual.path, path);
  }
});
