import { A0, alcoveKey, edges, rootCenter, sameAlcove, } from './affineA2.js';
export const MAX_GALLERY_LENGTH = 60;
/** Integer strips for the three positive roots x, y, x+y. */
function rootLevels(a) {
    return [a.i, a.j, a.i + a.j + (a.half === 'U' ? 1 : 0)];
}
/** Exactly the number of affine hyperplanes separating two alcoves. */
export function galleryDistance(a, b) {
    const aa = rootLevels(a), bb = rootLevels(b);
    return aa.reduce((sum, level, k) => sum + Math.abs(level - bb[k]), 0);
}
function wallOf(a, type) {
    const wall = edges(a).find(edge => edge.type === type);
    if (!wall)
        throw new Error('Invalid wall type');
    return wall;
}
/** Ram's periodic orientation: the positive side has larger positive-root value. */
export function crossingSign(a, type) {
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
export function reducedGallery(weight) {
    if (!Number.isSafeInteger(weight.a) || !Number.isSafeInteger(weight.b)) {
        throw new Error('Weight coefficients a and b must be safe integers');
    }
    // A cheap bound also prevents arithmetic outside the safe-integer range.
    if (Math.abs(weight.a) > MAX_GALLERY_LENGTH || Math.abs(weight.b) > MAX_GALLERY_LENGTH) {
        throw new Error(`Reduced paths support at most ${MAX_GALLERY_LENGTH} steps; choose a smaller weight`);
    }
    const target = { i: -weight.a || 0, j: -weight.b || 0, half: 'L' };
    let remaining = galleryDistance(A0, target);
    if (remaining > MAX_GALLERY_LENGTH) {
        throw new Error(`This reduced path needs ${remaining} steps; the limit is ${MAX_GALLERY_LENGTH}. Choose a smaller weight`);
    }
    const gallery = {
        weight: { a: weight.a || 0, b: weight.b || 0 }, target,
        word: [], nodes: [{ ...A0 }], signs: [],
    };
    let current = { ...A0 };
    while (remaining > 0) {
        // A decreasing separating-wall count gives a reduced gallery. Breaking
        // ties by Coxeter wall type makes the chosen gallery deterministic.
        const wall = edges(current).sort((a, b) => a.type - b.type)
            .find(edge => galleryDistance(edge.adjacent, target) === remaining - 1);
        if (!wall)
            throw new Error('No neighboring alcove reduces the distance');
        gallery.word.push(wall.type);
        gallery.signs.push(crossingSign(current, wall.type));
        current = { ...wall.adjacent };
        gallery.nodes.push(current);
        remaining--;
    }
    if (!sameAlcove(current, target))
        throw new Error('Reduced-path endpoint validation failed');
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
    total;
    gallery;
    rule;
    suffixCounts = new Map();
    constructor(gallery, rule) {
        if (!['all', 'positive', 'ram'].includes(rule))
            throw new Error('Invalid folding rule');
        if (gallery.word.length > MAX_GALLERY_LENGTH)
            throw new Error(`At most ${MAX_GALLERY_LENGTH} steps are supported`);
        if (gallery.signs.length !== gallery.word.length)
            throw new Error('Reference-path signs are incomplete');
        this.gallery = {
            weight: { ...gallery.weight }, target: { ...gallery.target },
            word: [...gallery.word], nodes: gallery.nodes.map(a => ({ ...a })),
            signs: [...gallery.signs],
        };
        this.rule = rule;
        this.total = this.count(0, A0);
    }
    canFold(position, current) {
        if (this.rule === 'all')
            return true;
        const actual = crossingSign(current, this.gallery.word[position]);
        return this.rule === 'positive' ? actual === -1 : actual === -this.gallery.signs[position];
    }
    count(position, current) {
        const remaining = this.gallery.word.length - position;
        if (remaining === 0)
            return 1n;
        if (this.rule === 'all')
            return 1n << BigInt(remaining);
        const key = `${position}:${alcoveKey(current)}`;
        const cached = this.suffixCounts.get(key);
        if (cached !== undefined)
            return cached;
        const wall = wallOf(current, this.gallery.word[position]);
        let count = this.count(position + 1, wall.adjacent);
        if (this.canFold(position, current))
            count += this.count(position + 1, current);
        this.suffixCounts.set(key, count);
        return count;
    }
    pathAt(index) {
        if (typeof index !== 'bigint' || index < 0n || index >= this.total) {
            throw new Error('Path index is out of range');
        }
        const path = { nodes: [{ ...A0 }], steps: [], folds: 0, positiveFolds: 0, negativeFolds: 0 };
        let current = { ...A0 };
        for (let position = 0; position < this.gallery.word.length; position++) {
            const type = this.gallery.word[position], wall = wallOf(current, type);
            const actual = crossingSign(current, type);
            const crossingCount = this.count(position + 1, wall.adjacent);
            const folding = index >= crossingCount;
            if (folding) {
                if (!this.canFold(position, current))
                    throw new Error('Folded-path count is inconsistent');
                index -= crossingCount;
            }
            const next = folding ? { ...current } : { ...wall.adjacent };
            const sign = folding ? (actual === 1 ? -1 : 1) : actual;
            path.steps.push({ index: position + 1, type, kind: folding ? 'fold' : 'cross', sign, from: { ...current }, to: next, wall });
            path.nodes.push(next);
            if (folding) {
                path.folds++;
                if (sign === 1)
                    path.positiveFolds++;
                else
                    path.negativeFolds++;
            }
            current = next;
        }
        return path;
    }
}
