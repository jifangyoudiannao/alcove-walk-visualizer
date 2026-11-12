import {
  A0, alcoveKey, edges, rootCenter, sameAlcove,
  type Alcove, type Edge, type WallType,
} from './affineA2.js';

export interface Weight { a: number; b: number }
export type FoldRule = 'all' | 'positive' | 'ram';
export type Sign = 1 | -1;
export interface FoldStep {
  /** One-based position in the fixed wall-type sequence. */
  index: number;
  type: WallType;
  kind: 'cross' | 'fold';
  /** Crossing direction, or the side on which a fold stays. */
  sign: Sign;
  from: Alcove;
  to: Alcove;
  wall: Edge;
}
export interface FoldPath {
  nodes: Alcove[];
  steps: FoldStep[];
  folds: number;
  positiveFolds: number;
  negativeFolds: number;
}
export interface ReducedGallery {
  weight: Weight;
  target: Alcove;
  word: WallType[];
  nodes: Alcove[];
  signs: Sign[];
}
export const MAX_GALLERY_LENGTH = 60;

/** Integer strips for the three positive roots x, y, x+y. */
function rootLevels(a: Alcove): [number, number, number] {
  return [a.i, a.j, a.i + a.j + (a.half === 'U' ? 1 : 0)];
}

/** Exactly the number of affine hyperplanes separating two alcoves. */
export function galleryDistance(a: Alcove, b: Alcove): number {
  const aa = rootLevels(a), bb = rootLevels(b);
  return aa.reduce((sum, level, k) => sum + Math.abs(level - bb[k]), 0);
}

function wallOf(a: Alcove, type: WallType): Edge {
  const wall = edges(a).find(edge => edge.type === type);
  if (!wall) throw new Error('无效的墙类型');
  return wall;
}

/** Ram's periodic orientation: the positive side has larger positive-root value. */
export function crossingSign(a: Alcove, type: WallType): Sign {
  const wall = wallOf(a, type);
  const from = rootCenter(a), to = rootCenter(wall.adjacent);
  const difference = wall.start.x === wall.end.x ? to.x - from.x
    : wall.start.y === wall.end.y ? to.y - from.y
    : to.x + to.y - from.x - from.y;
  return difference > 0 ? 1 : -1;
}

/**
 * lambda = a omega_1 + b omega_2, so A0 - lambda = L(-a,-b).
 * In simply-laced A2 our root coordinates identify weights and coweights.
 * General weight translations need not preserve vertex types: P != Q.
 * The returned word describes the gallery to the translated alcove; it is
 * not asserted to equal the pure translation in the affine Weyl group.
 */
export function reducedGallery(weight: Weight): ReducedGallery {
  if (!Number.isSafeInteger(weight.a) || !Number.isSafeInteger(weight.b)) {
    throw new Error('weight 的系数 a、b 必须是安全范围内的整数');
  }
  // A cheap bound also prevents arithmetic outside the safe-integer range.
  if (Math.abs(weight.a) > MAX_GALLERY_LENGTH || Math.abs(weight.b) > MAX_GALLERY_LENGTH) {
    throw new Error(`约化路径最多支持 ${MAX_GALLERY_LENGTH} 步，请减小 weight`);
  }
  const target: Alcove = { i: -weight.a || 0, j: -weight.b || 0, half: 'L' };
  let remaining = galleryDistance(A0, target);
  if (remaining > MAX_GALLERY_LENGTH) {
    throw new Error(`约化路径需要 ${remaining} 步；目前最多支持 ${MAX_GALLERY_LENGTH} 步，请减小 weight`);
  }
  const gallery: ReducedGallery = {
    weight: { a: weight.a || 0, b: weight.b || 0 }, target,
    word: [], nodes: [{ ...A0 }], signs: [],
  };
  let current = { ...A0 };
  while (remaining > 0) {
    // A decreasing separating-wall count gives a reduced gallery. Breaking
    // ties by Coxeter wall type makes the chosen gallery deterministic.
    const wall = edges(current).sort((a, b) => a.type - b.type)
      .find(edge => galleryDistance(edge.adjacent, target) === remaining - 1);
    if (!wall) throw new Error('未找到缩短距离的相邻 alcove');
    gallery.word.push(wall.type);
    gallery.signs.push(crossingSign(current, wall.type));
    current = { ...wall.adjacent };
    gallery.nodes.push(current);
    remaining--;
  }
  if (!sameAlcove(current, target)) throw new Error('约化路径终点校验失败');
  return gallery;
}

/**
 * Every path has the reference wall-type sequence, including at folds.
 * Crossing is always available. A fold retains the current alcove, so the
 * next wall is looked up there rather than on the original reference path.
 *
 * 'all': both choices at every step (the user's unrestricted folding rule).
 * 'positive': folds only on the positive side of the current wall.
 * 'ram': Theorem 3.3, with initial w=e. A fold must have the reference sign.
 * Starting on the reference path prevents the first such fold, so this
 * last family is a singleton. It is not Lenart–Postnikov admissibility.
 *
 * Paths are ordered lexicographically with crossing before folding.
 * Exact BigInt counts and suffix counts permit random access without
 * materializing exponentially many paths; pagination never drops paths.
 */
export class FoldFamily {
  readonly total: bigint;
  readonly gallery: ReducedGallery;
  readonly rule: FoldRule;
  private readonly suffixCounts = new Map<string, bigint>();

  constructor(gallery: ReducedGallery, rule: FoldRule) {
    if (!['all', 'positive', 'ram'].includes(rule)) throw new Error('无效的折叠规则');
    if (gallery.word.length > MAX_GALLERY_LENGTH) throw new Error(`最多支持 ${MAX_GALLERY_LENGTH} 步`);
    if (gallery.signs.length !== gallery.word.length) throw new Error('参考路径符号不完整');
    this.gallery = {
      weight: { ...gallery.weight }, target: { ...gallery.target },
      word: [...gallery.word], nodes: gallery.nodes.map(a => ({ ...a })),
      signs: [...gallery.signs],
    };
    this.rule = rule;
    this.total = this.count(0, A0);
  }

  private canFold(position: number, current: Alcove): boolean {
    if (this.rule === 'all') return true;
    const actual = crossingSign(current, this.gallery.word[position]);
    return this.rule === 'positive' ? actual === -1 : actual === -this.gallery.signs[position];
  }

  private count(position: number, current: Alcove): bigint {
    const remaining = this.gallery.word.length - position;
    if (remaining === 0) return 1n;
    if (this.rule === 'all') return 1n << BigInt(remaining);
    const key = `${position}:${alcoveKey(current)}`;
    const cached = this.suffixCounts.get(key);
    if (cached !== undefined) return cached;
    const wall = wallOf(current, this.gallery.word[position]);
    let count = this.count(position + 1, wall.adjacent);
    if (this.canFold(position, current)) count += this.count(position + 1, current);
    this.suffixCounts.set(key, count);
    return count;
  }

  pathAt(index: bigint): FoldPath {
    if (typeof index !== 'bigint' || index < 0n || index >= this.total) {
      throw new Error('路径编号超出范围');
    }
    const path: FoldPath = { nodes: [{ ...A0 }], steps: [], folds: 0, positiveFolds: 0, negativeFolds: 0 };
    let current = { ...A0 };
    for (let position = 0; position < this.gallery.word.length; position++) {
      const type = this.gallery.word[position], wall = wallOf(current, type);
      const actual = crossingSign(current, type);
      const crossingCount = this.count(position + 1, wall.adjacent);
      const folding = index >= crossingCount;
      if (folding) {
        if (!this.canFold(position, current)) throw new Error('折叠路径计数不一致');
        index -= crossingCount;
      }
      const next = folding ? { ...current } : { ...wall.adjacent };
      const sign: Sign = folding ? (actual === 1 ? -1 : 1) : actual;
      path.steps.push({ index: position + 1, type, kind: folding ? 'fold' : 'cross', sign, from: { ...current }, to: next, wall });
      path.nodes.push(next);
      if (folding) {
        path.folds++;
        if (sign === 1) path.positiveFolds++;
        else path.negativeFolds++;
      }
      current = next;
    }
    return path;
  }
}
