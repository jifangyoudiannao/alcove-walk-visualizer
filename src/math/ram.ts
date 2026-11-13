import {
  A0, alcoveKey, coxeterLength, edges, sameAlcove, wordToAlcove,
  type Alcove, type Edge, type WallType,
} from './affineA2.js';
import {
  MAX_GALLERY_LENGTH, reducedGallery,
  type FoldPath, type FoldStep, type Sign, type Weight,
} from './folded.js';

export interface RamReference {
  /** Fundamental-weight coordinates; the reference endpoint is A0 + lambda. */
  weight: Weight;
  target: Alcove;
  word: WallType[];
  signs: Sign[];
  nodes: Alcove[];
}
export interface RamChoices {
  wall: Edge;
  /** The side of the actual affine wall containing the current alcove. */
  side: Sign;
  referenceSign: Sign;
  crossingSign: Sign;
  canFold: boolean;
}
export type RamAction = 'cross' | 'fold';

const START_WORDS: { id: string; label: string; word: WallType[] }[] = [
  { id: 'e', label: 'e · A₀', word: [] },
  { id: '1', label: 's₁', word: [1] },
  { id: '2', label: 's₂', word: [2] },
  { id: '12', label: 's₁s₂', word: [1, 2] },
  { id: '21', label: 's₂s₁', word: [2, 1] },
  { id: '121', label: 'w₀ = s₁s₂s₁', word: [1, 2, 1] },
];
export const FINITE_STARTS = START_WORDS.map(item => ({ ...item, alcove: wordToAlcove(item.word) }));

function copyAlcove(alcove: Alcove): Alcove { return { ...alcove }; }
function validateAlcove(alcove: Alcove): void {
  // Leave enough exact-integer headroom for 60 steps and the scaled root
  // evaluations below. All computations use root coordinates, never pixels.
  const bound = Math.floor(Number.MAX_SAFE_INTEGER / 16) - MAX_GALLERY_LENGTH;
  if (!alcove || !Number.isSafeInteger(alcove.i) || !Number.isSafeInteger(alcove.j)
    || Math.abs(alcove.i) > bound || Math.abs(alcove.j) > bound
    || (alcove.half !== 'L' && alcove.half !== 'U')) {
    throw new Error('Invalid starting-alcove coordinates');
  }
}
function negate(sign: Sign): Sign { return sign === 1 ? -1 : 1; }
function wallOf(alcove: Alcove, type: WallType): Edge {
  const wall = edges(alcove).find(edge => edge.type === type);
  if (!wall) throw new Error('Wall type must be 0, 1, or 2');
  return wall;
}

/**
 * Exact periodic orientation. Three times the centroid has integer root
 * coordinates, so no floating-point/pixel tolerance is needed. Wall type
 * only selects the current edge; its physical hyperplane determines sign.
 */
function actualSide(alcove: Alcove, wall: Edge): Sign {
  const offset = alcove.half === 'L' ? 1 : 2;
  const x3 = 3 * alcove.i + offset, y3 = 3 * alcove.j + offset;
  const signedDistance3 = wall.start.x === wall.end.x ? x3 - 3 * wall.start.x
    : wall.start.y === wall.end.y ? y3 - 3 * wall.start.y
    : x3 + y3 - 3 * (wall.start.x + wall.start.y);
  if (signedDistance3 === 0) throw new Error('An interior alcove point cannot lie on a wall');
  return signedDistance3 > 0 ? 1 : -1;
}

/** Make or verify a reduced reference gallery to A0 + lambda. */
export function ramReference(weight: Weight, word?: readonly WallType[]): RamReference {
  if (!weight || !Number.isSafeInteger(weight.a) || !Number.isSafeInteger(weight.b)) {
    throw new Error('Weight coefficients a and b must be safe integers');
  }
  // The old explorer deliberately uses A0 - lambda. Negating here preserves
  // that feature while giving the independent Ram mode its plus convention.
  const generated = reducedGallery({ a: -weight.a, b: -weight.b });
  const reference: RamReference = {
    weight: { a: weight.a || 0, b: weight.b || 0 }, target: { ...generated.target },
    word: word === undefined ? [...generated.word] : [...word], signs: [], nodes: [{ ...A0 }],
  };
  if (reference.word.length > MAX_GALLERY_LENGTH) throw new Error(`Reference paths support at most ${MAX_GALLERY_LENGTH} steps`);
  if (reference.word.some(type => type !== 0 && type !== 1 && type !== 2)) throw new Error('Reference wall types must be 0, 1, or 2');
  let current = { ...A0 };
  for (const type of reference.word) {
    const wall = wallOf(current, type);
    reference.signs.push(negate(actualSide(current, wall)));
    current = copyAlcove(wall.adjacent);
    reference.nodes.push(current);
  }
  if (coxeterLength(current) !== reference.word.length) throw new Error('The reference path must be reduced; remove backtracking or use automatic generation');
  if (!sameAlcove(current, reference.target)) throw new Error('The reference word does not end at the specified A₀ + λ');
  return reference;
}

function checkedReference(reference: RamReference, positiveOnly: boolean): RamReference {
  if (!reference || !Array.isArray(reference.word) || !Array.isArray(reference.signs) || !Array.isArray(reference.nodes)) {
    throw new Error('Reference-path data are incomplete');
  }
  const expected = ramReference(reference.weight, reference.word);
  if (!reference.target || !sameAlcove(expected.target, reference.target)
    || reference.nodes.length !== expected.nodes.length
    || reference.signs.length !== expected.signs.length
    || reference.signs.some((sign, k) => sign !== expected.signs[k])
    || reference.nodes.some((node, k) => !node || !sameAlcove(node, expected.nodes[k]))) {
    throw new Error('Reference-path geometry or crossing signs are inconsistent');
  }
  if (positiveOnly && expected.signs.some(sign => sign !== 1)) {
    throw new Error('Positive Folding Mode requires all reference crossings to be positive; choose a dominant weight');
  }
  return expected;
}

/** Ram Theorem 3.3's four-case table, with no Bruhat-cover restriction. */
export function ramChoices(reference: RamReference, position: number, current: Alcove): RamChoices {
  validateAlcove(current);
  if (!Number.isInteger(position) || position < 0 || position >= reference.word.length) {
    throw new Error('Reference-step index is out of range');
  }
  const referenceSign = reference.signs[position];
  if (referenceSign !== 1 && referenceSign !== -1) throw new Error('The reference crossing sign must be + or −');
  const wall = wallOf(current, reference.word[position]);
  const side = actualSide(current, wall);
  // If side = epsilon, the candidate fold f_i^epsilon is geometrically
  // available. The unique crossing always goes to the opposite side.
  return { wall, side, referenceSign, crossingSign: negate(side), canFold: side === referenceSign };
}

function emptyPath(start: Alcove): FoldPath {
  return { nodes: [copyAlcove(start)], steps: [], folds: 0, positiveFolds: 0, negativeFolds: 0 };
}
function appendAction(reference: RamReference, path: FoldPath, kind: RamAction): FoldStep {
  if (kind !== 'cross' && kind !== 'fold') throw new Error('The action must be crossing or folding');
  const position = path.steps.length, current = path.nodes[path.nodes.length - 1];
  const choice = ramChoices(reference, position, current);
  if (kind === 'fold' && !choice.canFold) throw new Error('This Ram fold is not allowed on the current side; crossing is required');
  const next = kind === 'fold' ? copyAlcove(current) : copyAlcove(choice.wall.adjacent);
  const sign = kind === 'fold' ? choice.side : choice.crossingSign;
  const step: FoldStep = {
    index: position + 1, type: reference.word[position], kind, sign,
    from: copyAlcove(current), to: next, wall: choice.wall,
  };
  path.steps.push(step);
  // A repeated position records a fold event; it is not a new distinct alcove.
  path.nodes.push(next);
  if (kind === 'fold') {
    path.folds++;
    if (sign === 1) path.positiveFolds++;
    else path.negativeFolds++;
  }
  return step;
}

export class RamWalk {
  readonly reference: RamReference;
  readonly start: Alcove;
  readonly positiveOnly: boolean;
  private state: FoldPath;
  constructor(reference: RamReference, start: Alcove = A0, positiveOnly = false) {
    this.reference = checkedReference(reference, positiveOnly);
    validateAlcove(start);
    this.start = copyAlcove(start); this.positiveOnly = positiveOnly;
    this.state = emptyPath(start);
  }
  get path(): FoldPath { return this.state; }
  get position(): number { return this.state.steps.length; }
  get complete(): boolean { return this.position === this.reference.word.length; }
  get current(): Alcove { return this.state.nodes[this.state.nodes.length - 1]; }
  get next(): RamChoices | null { return this.complete ? null : ramChoices(this.reference, this.position, this.current); }
  step(kind: RamAction): FoldStep {
    if (this.complete) throw new Error('The reference path is complete; undo a step or reset');
    return appendAction(this.reference, this.state, kind);
  }
  undo(): boolean {
    if (!this.position) return false;
    this.loadActions(this.state.steps.slice(0, -1).map(step => step.kind));
    return true;
  }
  reset(): void { this.state = emptyPath(this.start); }
  /** Atomic replay: an invalid action leaves the previous manual walk intact. */
  loadActions(kinds: readonly RamAction[]): void {
    if (!Array.isArray(kinds) || kinds.length > this.reference.word.length) throw new Error('The action sequence exceeds the reference-path length');
    const next = emptyPath(this.start);
    for (const kind of kinds) appendAction(this.reference, next, kind);
    this.state = next;
  }
}

/**
 * Memoized DFS counts the complete branch tree exactly. pathAt un-ranks its
 * leaves in cross-before-fold order, so pagination is exhaustive without
 * storing every complete path, and distinct action sequences remain distinct.
 */
export class RamFamily {
  readonly reference: RamReference;
  readonly start: Alcove;
  readonly positiveOnly: boolean;
  readonly total: bigint;
  private readonly suffixCounts = new Map<string, bigint>();
  constructor(reference: RamReference, start: Alcove = A0, positiveOnly = false) {
    this.reference = checkedReference(reference, positiveOnly);
    validateAlcove(start);
    this.start = copyAlcove(start); this.positiveOnly = positiveOnly;
    this.total = this.count(0, this.start);
  }
  private count(position: number, current: Alcove): bigint {
    if (position === this.reference.word.length) return 1n;
    const key = `${position}:${alcoveKey(current)}`;
    const cached = this.suffixCounts.get(key);
    if (cached !== undefined) return cached;
    const choice = ramChoices(this.reference, position, current);
    let count = this.count(position + 1, choice.wall.adjacent);
    if (choice.canFold) count += this.count(position + 1, current);
    this.suffixCounts.set(key, count);
    return count;
  }
  pathAt(index: bigint): FoldPath {
    if (typeof index !== 'bigint' || index < 0n || index >= this.total) throw new Error('Ram path index is out of range');
    const path = emptyPath(this.start);
    for (let position = 0; position < this.reference.word.length; position++) {
      const current = path.nodes[path.nodes.length - 1];
      const choice = ramChoices(this.reference, position, current);
      const crossingCount = this.count(position + 1, choice.wall.adjacent);
      if (index < crossingCount) appendAction(this.reference, path, 'cross');
      else {
        index -= crossingCount;
        appendAction(this.reference, path, 'fold');
      }
    }
    return path;
  }
}

export function describeRamPath(reference: RamReference, start: Alcove, path: FoldPath) {
  // Replay using the same enforced table as the manual UI and enumeration.
  // This also guarantees that exported hyperplanes belong to actual steps.
  const replay = new RamWalk(reference, start);
  replay.loadActions(path.steps.map(step => step.kind));
  const checked = replay.path;
  const coefficientSign: Sign = checked.negativeFolds % 2 === 0 ? 1 : -1;
  const factor = checked.folds === 0 ? '1' : checked.folds === 1 ? '(q − q⁻¹)' : `(q − q⁻¹)^${checked.folds}`;
  return {
    reference: {
      weight: { ...replay.reference.weight }, target: copyAlcove(replay.reference.target),
      word: [...replay.reference.word], signs: [...replay.reference.signs],
      walls: replay.reference.word.map((type, position) => wallOf(replay.reference.nodes[position], type).equation),
    },
    initialAlcove: copyAlcove(start), currentAlcove: copyAlcove(replay.current),
    finalAlcove: replay.complete ? copyAlcove(replay.current) : null,
    complete: replay.complete,
    steps: checked.steps.map((step, position) => {
      const choice = ramChoices(replay.reference, position, step.from);
      return { ...step, side: choice.side, referenceSign: choice.referenceSign };
    }),
    foldingPositions: checked.steps.filter(step => step.kind === 'fold').map(step => step.index),
    positiveFolds: checked.positiveFolds, negativeFolds: checked.negativeFolds, totalFolds: checked.folds,
    coefficient: { sign: coefficientSign, power: checked.folds, expression: `${coefficientSign === -1 ? '−' : ''}${factor}` },
    // A geometric alcove in the affine Coxeter complex alone does not encode
    // the Omega sheet for general P/Q weights. Do not fabricate wt(p), phi(p).
    algebraicEndpoint: {
      implemented: false,
      reason: 'Extended affine Weyl group Ω sheets are not tracked. Only the exact alcove is reported; Ram wt(p) and φ(p) are not inferred.',
    },
  };
}
