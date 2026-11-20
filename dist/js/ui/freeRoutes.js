import { edges, toCartesian } from '../math/affineA2.js';
const subscript = ['₀', '₁', '₂'];
const paper = '#fffefa';
const num = (value) => Number(value.toFixed(2));
const coords = (point) => `${num(point.x)} ${num(point.y)}`;
const pointKey = (node) => `${node.point.u},${node.point.v}`;
function interpolate(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
function register(owners, key, pathId) {
    let ids = owners.get(key);
    if (!ids)
        owners.set(key, ids = new Set());
    ids.add(pathId);
}
function wallKey(edge) {
    // An affine wall may span many screen triangles. Match this edge segment.
    return `${edge.start.x + edge.end.x},${edge.start.y + edge.end.y}`;
}
function foldWall(node) {
    return edges(node.alcove).find(edge => edge.type === node.via);
}
function displayPoint(node, id, owners, project, scale) {
    const point = project(node.point);
    if (owners.size === 1)
        return point;
    // Keep coincident path markers separate while staying inside the same alcove,
    // even for unsnapped points close to an edge.
    let clearance = Infinity;
    for (const edge of edges(node.alcove)) {
        const a = project(toCartesian(edge.start)), b = project(toCartesian(edge.end));
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.abs(dx * (point.y - a.y) - dy * (point.x - a.x)) / Math.hypot(dx, dy);
        clearance = Math.min(clearance, distance);
    }
    const index = [...owners].indexOf(id);
    const radius = Math.min(clearance * .65, scale * .18, owners.size === 2 ? 10 : 17);
    const angle = Math.PI / 2 + 2 * Math.PI * index / owners.size;
    return { x: point.x + radius * Math.cos(angle), y: point.y + radius * Math.sin(angle) };
}
function crossingSVG(a, b, radius, marker, step) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!length)
        return '';
    const inset = Math.min((radius + 2) / length, .25);
    return `<path data-action="cross" data-step="${step}" d="M ${coords(interpolate(a, b, inset))} L ${coords(interpolate(a, b, 1 - inset))}" marker-end="url(#${marker})"/>`;
}
function foldSVG(mark, wallSlot, wallSlots, project, radius, marker) {
    const { node, anchor, wall, stepNumbers } = mark;
    const a = project(toCartesian(wall.start)), b = project(toCartesian(wall.end));
    // Individual turns on a shared wall have separate contact points on that wall.
    const t = .5 + (wallSlot - (wallSlots - 1) / 2) * Math.min(.21, .6 / wallSlots);
    const contact = interpolate(a, b, t);
    const left = interpolate(a, b, t - .19), right = interpolate(a, b, t + .19);
    const distance = Math.hypot(right.x - anchor.x, right.y - anchor.y);
    const end = interpolate(anchor, right, Math.min((radius + 2) / (distance || 1), .45));
    const label = `f${subscript[node.via]} · ${stepNumbers.length > 3 ? stepNumbers.length + ' folds' : stepNumbers.join(',')}`;
    const d = `M ${coords(anchor)} Q ${coords(left)} ${coords(contact)} Q ${coords(right)} ${coords(end)}`;
    return `<g data-action="fold" data-steps="${stepNumbers.join(',')}"><title>Fold at s${subscript[node.via]} on ${wall.equation}, steps ${stepNumbers.join(', ')}</title><path d="${d}" marker-end="url(#${marker})"/><circle cx="${num(contact.x)}" cy="${num(contact.y)}" r="2.6" fill="currentColor" stroke="none"/><text x="${num(contact.x + 5)}" y="${num(contact.y - 6)}" fill="currentColor" stroke="${paper}" stroke-width="3" paint-order="stroke" font-size="11" font-weight="600">${label}</text></g>`;
}
function stepDot(point, step, radius, endpoint) {
    const r = radius * (endpoint ? 1.12 : 1);
    return `<circle cx="${num(point.x)}" cy="${num(point.y)}" r="${num(r)}" fill="currentColor" stroke="${paper}" stroke-width="1.5"/><text x="${num(point.x)}" y="${num(point.y + .5)}" text-anchor="middle" dominant-baseline="middle" fill="white" stroke="none" font-weight="700" font-size="${num(Math.min(10, r * (step >= 100 ? .78 : 1.1)))}">${step}</text>`;
}
export function freeRoutesSVG(paths, activeId, project, scale) {
    const pointOwners = new Map();
    const wallOwners = new Map();
    for (const path of paths) {
        for (const node of path.walk.nodes) {
            register(pointOwners, pointKey(node), path.id);
            if (node.action === 'fold')
                register(wallOwners, wallKey(foldWall(node)), path.id);
        }
    }
    const radius = Math.max(2, Math.min(9, scale * .08));
    const markup = [];
    const displayOrder = [...paths].sort((a, b) => Number(a.id === activeId) - Number(b.id === activeId));
    for (const { id, color, walk } of displayOrder) {
        const marker = `free-arrow-${id}`;
        const parts = [];
        const nodes = walk.nodes;
        const points = nodes.map(node => displayPoint(node, id, pointOwners.get(pointKey(node)), project, scale));
        const folds = new Map();
        const dots = new Map();
        for (let k = 0; k < nodes.length; k++) {
            const node = nodes[k], key = pointKey(node);
            if (node.action === 'fold') {
                const wall = foldWall(node), turn = `${key}:${wallKey(wall)}`;
                const existing = folds.get(turn);
                if (existing)
                    existing.stepNumbers.push(k);
                else
                    folds.set(turn, { stepNumbers: [k], node, anchor: points[k], wall });
            }
            else {
                if (k)
                    parts.push(crossingSVG(points[k - 1], points[k], radius, marker, k));
                dots.set(key, k);
            }
        }
        for (const mark of folds.values()) {
            const owners = [...wallOwners.get(wallKey(mark.wall))];
            parts.push(foldSVG(mark, owners.indexOf(id), owners.length, project, radius, marker));
        }
        const endpoint = pointKey(nodes[nodes.length - 1]);
        for (const [key, k] of dots)
            parts.push(stepDot(points[k], k, radius, key === endpoint && id === activeId));
        markup.push(`<g data-free-path="${id}" color="${color}" stroke="currentColor" fill="none" stroke-width="${id === activeId ? 2.7 : 2.3}" stroke-linecap="round" stroke-linejoin="round" font-family="'DM Sans', sans-serif"><title>Path ${id}</title><defs><marker id="${marker}" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${color}" stroke="none"/></marker></defs>${parts.join('')}</g>`);
    }
    return markup.join('');
}
