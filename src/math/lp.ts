import {
  A0, edges, sameAlcove,
  type Alcove, type Edge, type RootPoint, type WallType,
} from './affineA2.js';
import {
  MAX_GALLERY_LENGTH, reducedGallery,
  type FoldPath, type FoldStep, type Sign, type Weight,
} from './folded.js';

/** One-line notation, with (ab)(i) = a(b(i)). */
export type Permutation = [number, number, number];
export type LPAction = 'cross' | 'fold';
export type LPRoot = 'alpha1' | 'alpha2' | 'alpha12';
export interface LPReflection {
  /** Original reference wall, never replaced by the current actual wall. */
  wall: Edge;
  root: LPRoot;
  level: number;
  finite: Permutation;
  label: string;
  rootLabel: string;
  finiteLabel: string;
  /** Sign of the LP lambda-chain root (opposite the reference crossing). */
  betaSign: Sign;
}
export interface LPReference {
  weight: Weight;
  target: Alcove;
  word: WallType[];
  nodes: Alcove[];
  reflections: LPReflection[];
  /** The specified endpoint vertex, not the centroid or g_ref(0). */
  terminalVertex: RootPoint;
}
export interface LPChoices {
  wall: Edge;
  side: Sign;
  crossingSign: Sign;
  referenceReflection: LPReflection;
  v: Permutation;
  candidate: Permutation;
  length: number;
  candidateLength: number;
  canFold: boolean;
  reason: string;
}
export interface LPStep extends FoldStep {
  vBefore: Permutation;
  vAfter: Permutation;
  referenceReflection: LPReflection;
}
export interface LPPath extends FoldPath {
  steps: LPStep[];
  bruhatChain: Permutation[];
  outputW: Permutation;
  foldingPositions: number[];
}

const E: Permutation = [1, 2, 3];
const W0: Permutation = [3, 2, 1];
const COPY = (p: Permutation): Permutation => [...p];
const NAMES: Record<string, string> = {
  '123': 'e', '213': 's₁', '132': 's₂', '231': 's₁s₂', '312': 's₂s₁', '321': 'w₀ = s₁s₂s₁',
};
export const LP_INPUTS: { id: string; label: string; permutation: Permutation }[] = [
  E, [2, 1, 3], [1, 3, 2], [2, 3, 1], [3, 1, 2], W0,
].map(permutation => {
  const p = permutation as Permutation;
  return { id: p.join(''), label: `${p.join('')} · ${NAMES[p.join('')]}`, permutation: COPY(p) };
});

function validatePermutation(p: Permutation): void {
  if (!Array.isArray(p) || p.length !== 3 || p.some(value => !Number.isInteger(value)) || [...p].sort().join('') !== '123') {
    throw new Error('A finite Weyl element must be a permutation of 1, 2, and 3');
  }
}
export function permutationKey(p: Permutation): string { validatePermutation(p); return p.join(''); }
export function formatPermutation(p: Permutation): string { return `${permutationKey(p)} (${NAMES[p.join('')]})`; }
export function permutationLength(p: Permutation): number {
  validatePermutation(p);
  let result = 0;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (p[i] > p[j]) result++;
  return result;
}
export function multiplyPermutations(a: Permutation, b: Permutation): Permutation {
  validatePermutation(a); validatePermutation(b);
  return b.map(value => a[value - 1]) as Permutation;
}
function copyEdge(wall: Edge): Edge {
  return { ...wall, start: { ...wall.start }, end: { ...wall.end }, adjacent: { ...wall.adjacent } };
}
function copyReflection(reflection: LPReflection): LPReflection {
  return { ...reflection, wall: copyEdge(reflection.wall), finite: COPY(reflection.finite) };
}
function wallOf(alcove: Alcove, type: WallType): Edge {
  const wall = edges(alcove).find(edge => edge.type === type);
  if (!wall) throw new Error('Wall type must be 0, 1, or 2');
  return wall;
}
function actualSide(alcove: Alcove, wall: Edge): Sign {
  // Exact integer evaluation of three times an interior point.
  const offset = alcove.half === 'L' ? 1 : 2;
  const x3 = 3 * alcove.i + offset, y3 = 3 * alcove.j + offset;
  const d = wall.start.x === wall.end.x ? x3 - 3 * wall.start.x
    : wall.start.y === wall.end.y ? y3 - 3 * wall.start.y
    : x3 + y3 - 3 * (wall.start.x + wall.start.y);
  if (!d) throw new Error('An interior alcove point cannot lie on a wall');
  return d > 0 ? 1 : -1;
}
function reflectionFor(alcove: Alcove, wall: Edge): LPReflection {
  const root: LPRoot = wall.start.x === wall.end.x ? 'alpha1'
    : wall.start.y === wall.end.y ? 'alpha2' : 'alpha12';
  const level = root === 'alpha1' ? wall.start.x : root === 'alpha2' ? wall.start.y : wall.start.x + wall.start.y;
  const finite: Permutation = root === 'alpha1' ? [2, 1, 3] : root === 'alpha2' ? [1, 3, 2] : [3, 2, 1];
  const rootLabel = root === 'alpha1' ? 'α₁' : root === 'alpha2' ? 'α₂' : 'α₁+α₂';
  const finiteLabel = root === 'alpha1' ? '(12) = s₁' : root === 'alpha2' ? '(23) = s₂' : '(13) = s₁s₂s₁';
  return { wall: copyEdge(wall), root, level, finite, label: `s[${rootLabel}, ${level}]`, rootLabel, finiteLabel, betaSign: actualSide(alcove, wall) };
}

/** Fixed reduced reference from A0 to the geometric alcove A0 - lambda. */
export function lpReference(weight: Weight, word?: readonly WallType[]): LPReference {
  if (!weight || !Number.isSafeInteger(weight.a) || !Number.isSafeInteger(weight.b)) {
    throw new Error('Weight coefficients a and b must be safe integers');
  }
  const generated = reducedGallery(weight);
  const types = word === undefined ? [...generated.word] : [...word];
  if (types.length > MAX_GALLERY_LENGTH) throw new Error(`Reference paths support at most ${MAX_GALLERY_LENGTH} steps`);
  if (types.some(type => type !== 0 && type !== 1 && type !== 2)) throw new Error('Reference wall types must be 0, 1, or 2');
  const reference: LPReference = {
    weight: { ...generated.weight }, target: { ...generated.target }, word: types,
    nodes: [{ ...A0 }], reflections: [], terminalVertex: { x: -weight.a || 0, y: -weight.b || 0 },
  };
  let current = { ...A0 };
  const crossedHyperplanes = new Set<string>();
  for (const type of types) {
    const wall = wallOf(current, type), reflection = reflectionFor(current, wall);
    const key = `${reflection.root}:${reflection.level}`;
    if (crossedHyperplanes.has(key)) throw new Error('The reference path is not reduced: it crosses the same affine hyperplane more than once');
    crossedHyperplanes.add(key);
    reference.reflections.push(reflection);
    current = { ...wall.adjacent }; reference.nodes.push(current);
  }
  if (!sameAlcove(current, reference.target)) throw new Error('The reference word does not geometrically end at the specified A₀ − λ');
  return reference;
}
function checkedReference(reference: LPReference): LPReference {
  if (!reference || !Array.isArray(reference.word)) throw new Error('LP reference-path data are incomplete');
  const expected = lpReference(reference.weight, reference.word);
  if (JSON.stringify(reference) !== JSON.stringify(expected)) {
    // Property order is immaterial for externally deserialized records.
    if (!reference.target || !sameAlcove(reference.target, expected.target)
      || reference.terminalVertex?.x !== expected.terminalVertex.x || reference.terminalVertex?.y !== expected.terminalVertex.y
      || !Array.isArray(reference.nodes) || reference.nodes.length !== expected.nodes.length
      || reference.nodes.some((node, i) => !node || !sameAlcove(node, expected.nodes[i]))
      || !Array.isArray(reference.reflections) || reference.reflections.length !== expected.reflections.length
      || reference.reflections.some((r, i) => {
        const e = expected.reflections[i];
        return !r || r.root !== e.root || r.level !== e.level || r.betaSign !== e.betaSign
          || !r.finite || r.finite.join('') !== e.finite.join('')
          || JSON.stringify(r.wall) !== JSON.stringify(e.wall);
      })) throw new Error('The original LP reference walls or designated terminal vertex are inconsistent');
  }
  return expected;
}

/** LP admissibility uses the fixed reference reflection, not the actual wall. */
export function lpChoices(reference: LPReference, position: number, current: Alcove, v: Permutation): LPChoices {
  if (!Number.isInteger(position) || position < 0 || position >= reference.word.length) throw new Error('Reference-step index is out of range');
  validatePermutation(v);
  const wall = wallOf(current, reference.word[position]), side = actualSide(current, wall);
  const referenceReflection = reference.reflections[position];
  const candidate = multiplyPermutations(v, referenceReflection.finite);
  const length = permutationLength(v), candidateLength = permutationLength(candidate);
  const canFold = candidateLength === length - 1;
  const reason = canFold ? `Length decreases from ${length} to ${candidateLength}: a descending Bruhat cover`
    : length === 0 ? `e has no descending Bruhat cover; the candidate length increases from 0 to ${candidateLength}`
    : `Length ${candidateLength < length ? 'decreases' : 'changes'} from ${length} to ${candidateLength}; a Bruhat cover must decrease length by exactly 1`;
  return { wall, side, crossingSign: side === 1 ? -1 : 1, referenceReflection, v: COPY(v), candidate, length, candidateLength, canFold, reason };
}
function emptyPath(u: Permutation): LPPath {
  return { nodes: [{ ...A0 }], steps: [], folds: 0, positiveFolds: 0, negativeFolds: 0,
    bruhatChain: [COPY(u)], outputW: COPY(u), foldingPositions: [] };
}
function appendAction(reference: LPReference, path: LPPath, kind: LPAction): LPStep {
  if (kind !== 'cross' && kind !== 'fold') throw new Error('The action must be crossing or folding');
  const position = path.steps.length, current = path.nodes[path.nodes.length - 1];
  const choice = lpChoices(reference, position, current, path.outputW);
  if (kind === 'fold' && !choice.canFold) throw new Error(choice.reason);
  const next = kind === 'fold' ? { ...current } : { ...choice.wall.adjacent };
  const vAfter = kind === 'fold' ? COPY(choice.candidate) : COPY(path.outputW);
  const sign = kind === 'fold' ? choice.side : choice.crossingSign;
  const step: LPStep = {
    index: position + 1, type: reference.word[position], kind, sign,
    from: { ...current }, to: next, wall: copyEdge(choice.wall),
    vBefore: COPY(path.outputW), vAfter, referenceReflection: copyReflection(choice.referenceReflection),
  };
  path.steps.push(step); path.nodes.push(next); path.outputW = COPY(vAfter);
  if (kind === 'fold') {
    path.folds++; path.foldingPositions.push(position + 1); path.bruhatChain.push(COPY(vAfter));
    if (sign === 1) path.positiveFolds++; else path.negativeFolds++;
  }
  return step;
}
export class LPWalk {
  readonly reference: LPReference;
  readonly u: Permutation;
  readonly start: Alcove = { ...A0 };
  private state: LPPath;
  constructor(reference: LPReference, u: Permutation = W0) {
    this.reference = checkedReference(reference); validatePermutation(u); this.u = COPY(u); this.state = emptyPath(u);
  }
  get path(): LPPath { return this.state; }
  get position(): number { return this.state.steps.length; }
  get current(): Alcove { return this.state.nodes[this.state.nodes.length - 1]; }
  get v(): Permutation { return this.state.outputW; }
  get complete(): boolean { return this.position === this.reference.word.length; }
  get next(): LPChoices | null { return this.complete ? null : lpChoices(this.reference, this.position, this.current, this.v); }
  step(kind: LPAction): LPStep {
    if (this.complete) throw new Error('The reference path is complete; undo a step or reset');
    return appendAction(this.reference, this.state, kind);
  }
  undo(): boolean {
    if (!this.position) return false;
    this.loadActions(this.state.steps.slice(0, -1).map(step => step.kind)); return true;
  }
  reset(): void { this.state = emptyPath(this.u); }
  /** Atomic replay restores all geometry, Bruhat state and J together. */
  loadActions(kinds: readonly LPAction[]): void {
    if (!Array.isArray(kinds) || kinds.length > this.reference.word.length) throw new Error('The action sequence exceeds the reference-path length');
    const next = emptyPath(this.u);
    for (const kind of kinds) appendAction(this.reference, next, kind);
    this.state = next;
  }
}

/** Exact memoized DFS; grouping suffix counts never merges distinct leaves/J. */
export class LPFamily {
  readonly reference: LPReference;
  readonly u: Permutation;
  readonly start: Alcove = { ...A0 };
  readonly total: bigint;
  private readonly suffixCounts = new Map<string, bigint>();
  constructor(reference: LPReference, u: Permutation = W0) {
    this.reference = checkedReference(reference); validatePermutation(u); this.u = COPY(u);
    this.total = this.count(0, u);
  }
  private count(position: number, v: Permutation): bigint {
    if (position === this.reference.word.length) return 1n;
    const key = `${position}:${v.join('')}`, cached = this.suffixCounts.get(key);
    if (cached !== undefined) return cached;
    const candidate = multiplyPermutations(v, this.reference.reflections[position].finite);
    let count = this.count(position + 1, v);
    if (permutationLength(candidate) === permutationLength(v) - 1) count += this.count(position + 1, candidate);
    this.suffixCounts.set(key, count); return count;
  }
  pathAt(index: bigint): LPPath {
    if (typeof index !== 'bigint' || index < 0n || index >= this.total) throw new Error('LP path index is out of range');
    const path = emptyPath(this.u);
    for (let position = 0; position < this.reference.word.length; position++) {
      const crossingCount = this.count(position + 1, path.outputW);
      if (index < crossingCount) appendAction(this.reference, path, 'cross');
      else { index -= crossingCount; appendAction(this.reference, path, 'fold'); }
    }
    return path;
  }
}

/** Reflect an exact weight point across a fixed affine wall. */
export function reflectLPPoint(reflection: LPReflection, point: RootPoint): RootPoint {
  const { x, y } = point, n = reflection.level;
  if (reflection.root === 'alpha1') return { x: 2 * n - x, y: y + x - n };
  if (reflection.root === 'alpha2') return { x: x + y - n, y: 2 * n - y };
  return { x: n - y, y: n - x };
}
export function actOnWeight(u: Permutation, weight: Weight): Weight {
  validatePermutation(u);
  // A representative in R^3 / R(1,1,1); u sends epsilon_i to epsilon_{u(i)}.
  const source = [weight.a + weight.b, weight.b, 0], target = [0, 0, 0];
  for (let i = 0; i < 3; i++) target[u[i] - 1] = source[i];
  return { a: target[0] - target[1] || 0, b: target[1] - target[2] || 0 };
}
function lpTerm(reference: LPReference, u: Permutation, positions: readonly number[], outputW: Permutation) {
  let terminal = { ...reference.terminalVertex };
  // r_j1 ... r_js(-lambda): the rightmost reflection acts first.
  for (let i = positions.length - 1; i >= 0; i--) terminal = reflectLPPoint(reference.reflections[positions[i] - 1], terminal);
  const acted = actOnWeight(u, { a: terminal.x, b: terminal.y });
  const mu = { a: -acted.a || 0, b: -acted.b || 0 };
  const negativeRootFolds = positions.filter(position => reference.reflections[position - 1].betaSign === -1).length;
  const sign: Sign = negativeRootFolds % 2 ? -1 : 1;
  return {
    implemented: true, mu, sign, negativeRootFolds, transformedTerminalVertex: terminal,
    expression: `${sign === -1 ? '−' : ''}x^[(${mu.a})ω₁ + (${mu.b})ω₂] [O_${permutationKey(outputW)}]`,
    formula: 'mu = -u r_j1 ... r_js(-lambda); sign = (-1)^(number of negative reference beta_j at folds)',
  };
}

export function describeLPPath(reference: LPReference, u: Permutation, path: LPPath) {
  const replay = new LPWalk(reference, u); replay.loadActions(path.steps.map(step => step.kind));
  const checked = replay.path;
  return {
    model: 'LP u-admissible foldings / K-theory',
    reference: replay.reference,
    initialAlcove: { ...A0 }, initialU: COPY(u),
    currentAlcove: { ...replay.current }, currentV: COPY(replay.v),
    finalAlcove: replay.complete ? { ...replay.current } : null,
    outputW: replay.complete ? COPY(replay.v) : null,
    complete: replay.complete,
    operations: checked.steps.map(step => step.kind),
    alcoveSequence: checked.nodes.map(node => ({ ...node })),
    geometricCrossingWord: checked.steps.filter(step => step.kind === 'cross').map(step => step.type),
    steps: checked.steps.map(step => ({ ...step, side: step.kind === 'fold' ? step.sign : -step.sign,
      lengthBefore: permutationLength(step.vBefore), lengthAfter: permutationLength(step.vAfter) })),
    foldingPositions: [...checked.foldingPositions],
    bruhatChain: checked.bruhatChain.map(COPY),
    totalFolds: checked.folds, positiveFolds: checked.positiveFolds, negativeFolds: checked.negativeFolds,
    lengthDropCheck: checked.folds === permutationLength(u) - permutationLength(replay.v),
    term: replay.complete ? lpTerm(replay.reference, u, checked.foldingPositions, replay.v) : null,
    endpointExplanation: 'finalAlcove is a geometric alcove; outputW is the finite Schubert index. They are different objects.',
  };
}
