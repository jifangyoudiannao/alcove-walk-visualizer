import test from 'node:test';
import assert from 'node:assert/strict';
import { A0, alcoveKey, edges, sameAlcove, wordToAlcove } from '../dist/js/math/affineA2.js';
import {
  LP_INPUTS, LPWalk, LPFamily, lpReference, lpChoices,
  permutationKey, permutationLength, multiplyPermutations, describeLPPath,
} from '../dist/js/math/lp.js';

const E = [1, 2, 3], W0 = [3, 2, 1];
const PERMUTATIONS = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]];
const actionsOf = path => path.steps.map(step => step.kind);
const jKey = positions => positions.join(',');

// Independent small-S3 oracle: swapping positions implements right
// multiplication by a transposition. No LP multiplication or cover helper.
function inversions(p) {
  let count = 0;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (p[i] > p[j]) count++;
  return count;
}
function swapPositions(p, pair) {
  const result = [...p];
  [result[pair[0]], result[pair[1]]] = [result[pair[1]], result[pair[0]]];
  return result;
}
function wallData(wall) {
  if (wall.start.x === wall.end.x) return { pair: [0, 1], axis: 'x', level: wall.start.x };
  if (wall.start.y === wall.end.y) return { pair: [1, 2], axis: 'y', level: wall.start.y };
  return { pair: [0, 2], axis: 'xy', level: wall.start.x + wall.start.y };
}
function side(alcove, data) {
  const t = alcove.half === 'L' ? 1 : 2;
  const x = 3 * alcove.i + t, y = 3 * alcove.j + t;
  return Math.sign((data.axis === 'x' ? x : data.axis === 'y' ? y : x + y) - 3 * data.level);
}
function referenceWalls(word) {
  let current = A0;
  return word.map(type => {
    const wall = edges(current).find(edge => edge.type === type);
    const data = wallData(wall);
    const result = { ...data, betaSign: side(current, data), wall };
    current = wall.adjacent;
    return result;
  });
}

// Exhaust ALL subsets, then check a complete chain, independently of the
// engine's DFS. This also reconstructs each actual geometry from A0.
function subsetOracle(reference, u) {
  const fixed = referenceWalls(reference.word), result = [];
  for (let mask = 0; mask < 2 ** reference.word.length; mask++) {
    let v = [...u], current = A0, admissible = true;
    const J = [], actions = [], nodes = [A0], chain = [[...u]];
    for (let k = 0; k < reference.word.length; k++) {
      const fold = !!(mask & (2 ** k));
      if (fold) {
        const candidate = swapPositions(v, fixed[k].pair);
        if (inversions(candidate) !== inversions(v) - 1) { admissible = false; break; }
        v = candidate; J.push(k + 1); chain.push([...v]);
      } else {
        current = edges(current).find(edge => edge.type === reference.word[k]).adjacent;
      }
      actions.push(fold ? 'fold' : 'cross'); nodes.push(current);
    }
    if (admissible) result.push({ J, actions, nodes, chain, w: v });
  }
  return result;
}

// Exact weight oracle in the ambient three-coordinate realization. Affine
// root reflection swaps two coordinates and adds +/- level. This differs
// from the engine's fundamental-weight coordinate reflection formulas.
function termOracle(reference, u, J) {
  const fixed = referenceWalls(reference.word);
  let triple = [-reference.weight.a - reference.weight.b, -reference.weight.b, 0];
  for (const position of [...J].reverse()) {
    const { pair: [i, j], level } = fixed[position - 1];
    const next = [...triple]; next[i] = triple[j] + level; next[j] = triple[i] - level;
    triple = next;
  }
  const transformedTerminalVertex = { x: triple[0] - triple[1], y: triple[1] - triple[2] };
  const acted = [0, 0, 0];
  for (let i = 0; i < 3; i++) acted[u[i] - 1] = -triple[i];
  const negativeRootFolds = J.filter(j => fixed[j - 1].betaSign < 0).length;
  return {
    mu: { a: acted[0] - acted[1], b: acted[1] - acted[2] },
    transformedTerminalVertex,
    sign: negativeRootFolds % 2 ? -1 : 1,
    negativeRootFolds,
  };
}

function assertPath(path, reference, u) {
  assert.deepEqual(path.nodes[0], A0, 'u must never move the geometric starting alcove');
  assert.equal(path.steps.length, reference.word.length);
  assert.equal(path.nodes.length, reference.word.length + 1);
  let v = [...u], previous = A0;
  const chain = [[...u]], J = [], fixed = referenceWalls(reference.word);
  path.steps.forEach((step, k) => {
    const wall = edges(previous).find(edge => edge.type === reference.word[k]);
    assert.equal(step.index, k + 1);
    assert.equal(step.type, reference.word[k]);
    assert.deepEqual(step.from, previous);
    assert.deepEqual(step.wall, wall);
    assert.deepEqual(step.vBefore, v);
    assert.deepEqual(step.referenceReflection.finite, swapPositions(E, fixed[k].pair));
    if (step.kind === 'fold') {
      const candidate = swapPositions(v, fixed[k].pair);
      assert.equal(inversions(candidate), inversions(v) - 1, 'every individual fold must be a cover');
      assert.deepEqual(step.to, previous, 'fold consumes a position without moving geometry');
      v = candidate; J.push(k + 1); chain.push([...v]);
    } else {
      assert.equal(step.kind, 'cross');
      assert.deepEqual(step.to, wall.adjacent);
      previous = wall.adjacent;
    }
    assert.deepEqual(step.vAfter, v);
    assert.deepEqual(path.nodes[k + 1], previous);
  });
  assert.deepEqual(path.foldingPositions, J);
  assert.deepEqual(path.bruhatChain, chain);
  assert.deepEqual(path.outputW, v);
  assert.equal(J.length, inversions(u) - inversions(v), 'required global length check C');
  assert.equal(path.folds, J.length);
}

test('LP S3 arithmetic uses (ab)(i)=a(b(i)), right reflections and inversion length', () => {
  assert.deepEqual(multiplyPermutations([2, 1, 3], [1, 3, 2]), [2, 3, 1]);
  assert.deepEqual(multiplyPermutations(W0, [2, 1, 3]), [2, 3, 1]);
  assert.deepEqual(multiplyPermutations([2, 3, 1], W0), [1, 3, 2]);
  for (const p of PERMUTATIONS) {
    assert.equal(permutationKey(p), p.join(''));
    assert.equal(permutationLength(p), inversions(p));
    for (const q of PERMUTATIONS) assert.deepEqual(multiplyPermutations(p, q), q.map(i => p[i - 1]));
  }
  assert.deepEqual(LP_INPUTS.map(input => input.id).sort(), PERMUTATIONS.map(p => p.join('')).sort());
});

test('LP test A: Example 15.6 has exactly the three stated J, alcove paths and output indices', () => {
  const ref = lpReference({ a: 1, b: 0 });
  assert.deepEqual(ref.word, [1, 2]);
  assert.deepEqual(ref.reflections.map(r => r.finite), [[2, 1, 3], W0]);
  assert.deepEqual(ref.reflections.map(r => r.wall.equation), ['x = 0', 'x + y = 0']);
  const family = new LPFamily(ref, W0);
  assert.equal(family.total, 3n);
  const paths = Array.from({ length: 3 }, (_, i) => family.pathAt(BigInt(i)));
  assert.deepEqual(paths.map(p => p.foldingPositions), [[], [1], [1, 2]]);
  assert.deepEqual(paths.map(p => p.outputW), [W0, [2, 3, 1], [1, 3, 2]]);
  assert.deepEqual(paths.map(p => p.nodes), [
    [A0, wordToAlcove([1]), wordToAlcove([1, 2])],
    [A0, A0, wordToAlcove([2])], [A0, A0, A0],
  ]);
  paths.forEach(path => assertPath(path, ref, W0));
  const walk = new LPWalk(ref, W0);
  walk.step('cross');
  assert.deepEqual(walk.next.candidate, E);
  assert.equal(walk.next.length, 3);
  assert.equal(walk.next.candidateLength, 0);
  assert.equal(walk.next.canFold, false, 'J={2} is a length-three drop, not a cover');
  assert.match(walk.next.reason, /3/); assert.match(walk.next.reason, /0/);
  const before = JSON.stringify(walk.path);
  assert.throws(() => walk.step('fold'));
  assert.equal(JSON.stringify(walk.path), before);
});

test('LP test B: u=e has only the empty folding set because it has no descending cover', () => {
  const ref = lpReference({ a: 1, b: 0 }), family = new LPFamily(ref, E), walk = new LPWalk(ref, E);
  assert.equal(family.total, 1n);
  assert.deepEqual(family.pathAt(0n).foldingPositions, []);
  assert.deepEqual(family.pathAt(0n).nodes, ref.nodes);
  while (!walk.complete) {
    assert.equal(walk.next.length, 0);
    assert.ok(walk.next.candidateLength > 0);
    assert.equal(walk.next.canFold, false);
    walk.step('cross');
  }
  assert.deepEqual(walk.v, E);
  assert.deepEqual(walk.current, ref.target);
});

test('LP tests C and D: DFS equals independent exhaustive subsets for 25 signed weights and all 6 inputs', () => {
  let familiesChecked = 0, pathsChecked = 0;
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (const u of PERMUTATIONS) {
    const ref = lpReference({ a, b }), expected = subsetOracle(ref, u), family = new LPFamily(ref, u);
    assert.equal(family.total, BigInt(expected.length), `lambda=(${a},${b}), u=${u}`);
    const byJ = new Map(expected.map(p => [jKey(p.J), p]));
    const seen = new Set();
    for (let index = 0n; index < family.total; index++) {
      const path = family.pathAt(index), key = jKey(path.foldingPositions), want = byJ.get(key);
      assert.ok(want, `unexpected subset ${key}`);
      assert.equal(seen.has(key), false, 'each J is retained exactly once'); seen.add(key);
      assert.deepEqual(actionsOf(path), want.actions);
      assert.deepEqual(path.nodes, want.nodes);
      assert.deepEqual(path.bruhatChain, want.chain);
      assert.deepEqual(path.outputW, want.w);
      assertPath(path, ref, u); pathsChecked++;
    }
    assert.equal(seen.size, expected.length);
    familiesChecked++;
  }
  assert.equal(familiesChecked, 150);
  assert.equal(pathsChecked, 628);
});

test('LP fixed reference reflection survives folding while the actual wall is recomputed', () => {
  const ref = lpReference({ a: 1, b: 0 }), original = JSON.stringify(ref), walk = new LPWalk(ref, W0);
  assert.deepEqual(walk.current, A0);
  walk.step('fold');
  assert.deepEqual(walk.current, A0);
  assert.deepEqual(walk.v, [2, 3, 1]);
  assert.equal(walk.next.wall.equation, 'y = 0');
  assert.equal(walk.next.referenceReflection.wall.equation, 'x + y = 0');
  assert.deepEqual(walk.next.referenceReflection.finite, W0);
  assert.deepEqual(walk.next.candidate, [1, 3, 2]);
  assert.equal(JSON.stringify(ref), original, 'reference data must never be overwritten');
  walk.step('fold');
  assert.deepEqual(walk.current, A0);
  assert.deepEqual(walk.v, [1, 3, 2]);
  assert.deepEqual(walk.path.foldingPositions, [1, 2]);
});

test('LP references validate geometric target and repeated hyperplanes, not repeated Coxeter labels', () => {
  const ref = lpReference({ a: 2, b: 1 });
  assert.ok(new Set(ref.word).size < ref.word.length, 'reduced references may repeat wall types');
  assert.doesNotThrow(() => lpReference({ a: 2, b: 1 }, ref.word));
  assert.equal(new Set(referenceWalls(ref.word).map(w => `${w.axis}:${w.level}`)).size, ref.word.length);
  assert.throws(() => lpReference({ a: 2, b: 1 }, [1, 1, ...ref.word]));
  assert.throws(() => lpReference({ a: 1, b: 0 }, [2, 1]));
  assert.throws(() => lpReference({ a: 1, b: 0 }, [1, 4]));
  assert.throws(() => lpReference({ a: 0.5, b: 0 }));
  assert.throws(() => lpReference({ a: 16, b: 15 }));
  const fundamental = lpReference({ a: 1, b: 0 }, [1, 2]);
  assert.ok(sameAlcove(fundamental.target, { i: -1, j: 0, half: 'L' }));
  assert.deepEqual(fundamental.terminalVertex, { x: -1, y: 0 });
  assert.deepEqual(wordToAlcove([1, 2]), fundamental.target);
  // s1s2 fixes 0, whereas the marked terminal vertex is -omega1.
  assert.notDeepEqual(fundamental.terminalVertex, { x: 0, y: 0 });
});

test('LP manual execution and replay agree with enumeration; undo restores geometry, Bruhat state and J', () => {
  for (const weight of [{ a: 1, b: 0 }, { a: 1, b: 1 }, { a: -1, b: 1 }]) for (const u of PERMUTATIONS) {
    const ref = lpReference(weight), family = new LPFamily(ref, u);
    for (let index = 0n; index < family.total; index++) {
      const expected = family.pathAt(index), walk = new LPWalk(ref, u), snapshots = [JSON.stringify(walk.path)];
      expected.steps.forEach(step => { walk.step(step.kind); snapshots.push(JSON.stringify(walk.path)); });
      assert.deepEqual(walk.path, expected);
      assert.equal(walk.complete, true); assert.equal(walk.next, null);
      assert.throws(() => walk.step('cross'));
      for (let k = expected.steps.length; k > 0; k--) {
        assert.equal(walk.undo(), true);
        assert.equal(JSON.stringify(walk.path), snapshots[k - 1]);
      }
      assert.equal(walk.undo(), false);
      assert.deepEqual(walk.current, A0); assert.deepEqual(walk.v, u);
      walk.loadActions(actionsOf(expected)); assert.deepEqual(walk.path, expected);
      walk.reset(); assert.deepEqual(walk.path.nodes, [A0]);
      assert.deepEqual(walk.path.bruhatChain, [u]); assert.deepEqual(walk.path.foldingPositions, []);
    }
  }
});

test('LP exact Example 15.6 weights use the marked terminal vertex and not Ram q factors', () => {
  const ref = lpReference({ a: 1, b: 0 }), family = new LPFamily(ref, W0);
  const mu = [{ a: 0, b: -1 }, { a: -1, b: 1 }, { a: 1, b: 0 }];
  for (let i = 0; i < 3; i++) {
    const path = family.pathAt(BigInt(i)), data = describeLPPath(ref, W0, path);
    assert.equal(data.complete, true);
    assert.deepEqual(data.finalAlcove, path.nodes.at(-1));
    assert.deepEqual(data.outputW, path.outputW);
    assert.deepEqual(data.term.mu, mu[i]);
    assert.equal(data.term.sign, 1);
    assert.doesNotMatch(data.term.expression, /q/);
    assert.doesNotThrow(() => JSON.stringify(data));
  }
});

test('LP exact affine-level weights and nondominant signs match an independent ambient-coordinate oracle', () => {
  let nonzeroLevelUsed = false, negativeContribution = false;
  for (const weight of [{ a: 2, b: 1 }, { a: -1, b: -1 }, { a: 2, b: -1 }, { a: -2, b: 1 }]) {
    const ref = lpReference(weight), fixed = referenceWalls(ref.word);
    for (const u of PERMUTATIONS) {
      const family = new LPFamily(ref, u);
      for (let i = 0n; i < family.total; i++) {
        const path = family.pathAt(i), data = describeLPPath(ref, u, path), expected = termOracle(ref, u, path.foldingPositions);
        assert.deepEqual(data.term.mu, expected.mu);
        assert.deepEqual(data.term.transformedTerminalVertex, expected.transformedTerminalVertex);
        assert.equal(data.term.sign, expected.sign);
        assert.equal(data.term.negativeRootFolds, expected.negativeRootFolds);
        nonzeroLevelUsed ||= path.foldingPositions.some(j => fixed[j - 1].level !== 0);
        negativeContribution ||= expected.sign === -1;
      }
    }
  }
  assert.ok(nonzeroLevelUsed, 'test must exercise genuine affine translations');
  assert.ok(negativeContribution, 'nondominant terms must not all be incorrectly positive');
});

test('LP indexed enumeration preserves different J even if final alcoves or output w coincide', () => {
  const ref = lpReference({ a: -1, b: 2 }), family = new LPFamily(ref, W0);
  const paths = Array.from({ length: Number(family.total) }, (_, i) => family.pathAt(BigInt(i)));
  assert.equal(paths.length, 10);
  assert.equal(new Set(paths.map(p => alcoveKey(p.nodes.at(-1)))).size, 9);
  assert.equal(new Set(paths.map(p => jKey(p.foldingPositions))).size, paths.length);
  assert.ok(new Set(paths.map(p => permutationKey(p.outputW))).size < paths.length);
  assert.ok(new Set(paths.map(p => alcoveKey(p.nodes.at(-1)))).size < paths.length);
  assert.throws(() => family.pathAt(-1n)); assert.throws(() => family.pathAt(family.total));
});

test('LP zero weight and the 60-step limit keep exact endpoint and full indexed access', () => {
  for (const u of PERMUTATIONS) {
    const zero = lpReference({ a: 0, b: 0 }), walk = new LPWalk(zero, u), family = new LPFamily(zero, u);
    assert.equal(walk.complete, true); assert.equal(walk.next, null); assert.equal(family.total, 1n);
    assert.deepEqual(walk.path.nodes, [A0]); assert.deepEqual(walk.path.outputW, u);
    assert.deepEqual(describeLPPath(zero, u, walk.path).term.mu, { a: 0, b: 0 });
  }
  const ref = lpReference({ a: 15, b: 15 }), family = new LPFamily(ref, W0);
  assert.equal(ref.word.length, 60);
  for (const index of [0n, family.total / 2n, family.total - 1n]) assertPath(family.pathAt(index), ref, W0);
});
