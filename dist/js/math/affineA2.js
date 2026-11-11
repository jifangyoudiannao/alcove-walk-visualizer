export const SQRT3 = Math.sqrt(3);
export const A0 = { i: 0, j: 0, half: 'L' };
function mod3(n) { return ((n % 3 + 3) % 3); }
export function vertexType(p) { return mod3(p.x + 2 * p.y); }
export function alcoveKey(a) { return `${a.i},${a.j},${a.half}`; }
export function fromKey(key) {
    const bits = key.split(',');
    if (bits.length !== 3 || !/^[-]?\d+$/.test(bits[0]) || !/^[-]?\d+$/.test(bits[1]) || !['L', 'U'].includes(bits[2])) {
        throw new Error(`Invalid alcove key: ${key}`);
    }
    return { i: Number(bits[0]), j: Number(bits[1]), half: bits[2] };
}
export function sameAlcove(a, b) {
    return a.i === b.i && a.j === b.j && a.half === b.half;
}
export function vertices(a) {
    const { i, j, half } = a;
    if (half === 'L')
        return [{ x: i, y: j }, { x: i + 1, y: j }, { x: i, y: j + 1 }];
    return [{ x: i + 1, y: j + 1 }, { x: i + 1, y: j }, { x: i, y: j + 1 }];
}
export function rootCenter(a) {
    const t = a.half === 'L' ? 1 / 3 : 2 / 3;
    return { x: a.i + t, y: a.j + t };
}
export function toCartesian(p) {
    return { u: SQRT3 / 2 * p.x, v: -0.5 * p.x - p.y };
}
export function toRoot(p) {
    const x = (2 / SQRT3) * p.u;
    return { x, y: -p.v - x / 2 };
}
export function center(a) { return toCartesian(rootCenter(a)); }
export function locateAlcove(p) {
    const i = Math.floor(p.x), j = Math.floor(p.y);
    return { i, j, half: (p.x - i + p.y - j <= 1) ? 'L' : 'U' };
}
export function edges(a) {
    const { i, j } = a;
    const r = mod3(i + 2 * j);
    if (a.half === 'L')
        return [
            { start: { x: i, y: j }, end: { x: i, y: j + 1 }, type: mod3(r + 1), adjacent: { i: i - 1, j, half: 'U' }, equation: `x = ${i}` },
            { start: { x: i, y: j }, end: { x: i + 1, y: j }, type: mod3(r + 2), adjacent: { i, j: j - 1, half: 'U' }, equation: `y = ${j}` },
            { start: { x: i + 1, y: j }, end: { x: i, y: j + 1 }, type: r, adjacent: { i, j, half: 'U' }, equation: `x + y = ${i + j + 1}` },
        ];
    return [
        { start: { x: i + 1, y: j }, end: { x: i + 1, y: j + 1 }, type: mod3(r + 2), adjacent: { i: i + 1, j, half: 'L' }, equation: `x = ${i + 1}` },
        { start: { x: i, y: j + 1 }, end: { x: i + 1, y: j + 1 }, type: mod3(r + 1), adjacent: { i, j: j + 1, half: 'L' }, equation: `y = ${j + 1}` },
        { start: { x: i + 1, y: j }, end: { x: i, y: j + 1 }, type: r, adjacent: { i, j, half: 'L' }, equation: `x + y = ${i + j + 1}` },
    ];
}
export function neighborAcross(a, type) {
    const edge = edges(a).find(e => e.type === type);
    if (!edge)
        throw new Error('Each A₂ alcove must have one wall of each Coxeter type');
    return edge.adjacent;
}
export function neighborLabel(a, b) {
    return edges(a).find(e => sameAlcove(e.adjacent, b))?.type ?? null;
}
export function crossedWall(a, b) {
    return edges(a).find(e => sameAlcove(e.adjacent, b)) ?? null;
}
/** Number of affine root hyperplanes separating the alcove from A₀. */
export function coxeterLength(a) {
    return Math.abs(a.i) + Math.abs(a.j) + Math.abs(a.i + a.j + (a.half === 'U' ? 1 : 0));
}
export function wordToAlcove(word) {
    return word.reduce((a, s) => neighborAcross(a, s), A0);
}
export function wordIsReduced(word) {
    return coxeterLength(wordToAlcove(word)) === word.length;
}
export function formatWord(word) {
    const sub = ['₀', '₁', '₂'];
    return word.length ? word.map(x => `s${sub[x]}`).join(' ') : 'e';
}
export function parseWord(text) {
    let s = text.trim().replace(/₀/g, '0').replace(/₁/g, '1').replace(/₂/g, '2');
    s = s.replace(/s\s*_?\s*\{?\s*([012])\s*\}?/gi, '$1');
    s = s.replace(/[\s,;→\-·]/g, '');
    if (!s || /[^012]/.test(s))
        throw new Error('请输入如 0 2 1 2、s₀ s₂ s₁ s₂ 或 s0s2s1s2 的反射字');
    if (s.length > 200)
        throw new Error('一次最多输入 200 步');
    return Array.from(s, digit => Number(digit));
}
