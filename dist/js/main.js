import { A0, alcoveKey, center, coxeterLength, crossedWall, edges, formatWord, fromKey, parseWord, toCartesian, toRoot, vertices, } from './math/affineA2.js';
import { FreePaths } from './math/freePaths.js';
import { freeRoutesSVG } from './ui/freeRoutes.js';
import { PROJECT_PROMPT } from './ui/prompt.js';
import { FoldExplorer, actionLabel } from './ui/foldExplorer.js';
import { galleryDistance } from './math/folded.js';
import { RamExplorer } from './ui/ramExplorer.js';
import { LPExplorer } from './ui/lpExplorer.js';
import { permutationKey } from './math/lp.js';
const COLORS = ['#709967', '#cb8290', '#6798bf'];
const SUB = ['₀', '₁', '₂'];
const STORAGE = 'alcove-walk-visualizer:v1';
const freePaths = new FreePaths();
const svg = document.getElementById('alcove-canvas');
let camera = { ox: 0, oy: 0, scale: 122 };
let cameraReady = false;
let snap = true;
let tool = 'draw';
let spaceHeld = false;
let drag = null;
let draggedRecently = false;
let toastHandle;
let explorer;
let ram;
let lp;
function currentFoldPath() { return lp?.active ? lp.path : ram?.active ? ram.path : explorer?.active ? explorer.path : null; }
function isFreeDrawing() { return !lp?.active && !ram?.active && !explorer?.active; }
function syncMode() {
    const ramActive = !!ram?.active, lpActive = !!lp?.active, guided = ramActive || lpActive;
    const free = isFreeDrawing();
    $('free-paths-panel').hidden = !free;
    document.querySelector('[data-tool="fold"]').hidden = !free;
    if (!free && tool === 'fold')
        tool = 'draw';
    syncToolButtons();
    $('ram-panel').hidden = !ramActive;
    $('lp-panel').hidden = !lpActive;
    $('weight-explorer-panel').hidden = guided;
    $('word-form').closest('section').hidden = guided;
    $('open-ram-mode').setAttribute('aria-pressed', String(ramActive));
    $('open-lp-mode').setAttribute('aria-pressed', String(lpActive));
    $('open-free-mode').setAttribute('aria-pressed', String(!guided));
}
function displayedNodes() {
    const path = currentFoldPath();
    if (path)
        return path.nodes.map((alcove, k) => ({ alcove, point: center(alcove), via: k ? path.steps[k - 1].type : null }));
    return freePaths.active.walk.nodes;
}
function $(id) {
    const el = document.getElementById(id);
    if (!el)
        throw new Error(`Missing UI element #${id}`);
    return el;
}
function showToast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    if (toastHandle)
        clearTimeout(toastHandle);
    toastHandle = setTimeout(() => el.classList.remove('show'), 2400);
}
function n(v) { return Number(v.toFixed(2)).toString(); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dims() { return { w: svg.clientWidth || 1000, h: svg.clientHeight || 760 }; }
function scenePoint(p, cam) {
    return { x: cam.ox + cam.scale * p.u, y: cam.oy + cam.scale * p.v };
}
function cartesianAt(px, py, cam) {
    return { u: (px - cam.ox) / cam.scale, v: (py - cam.oy) / cam.scale };
}
function mousePoint(e) {
    const b = svg.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
}
function initialCamera(w, h) { return { ox: w * .36, oy: h * .86, scale: 122 }; }
function fitCamera(w, h, pad = 105, maxScale = 175) {
    // Fit the whole path in either direction; preserve the actual free-click points.
    const guided = lp?.active ? lp : ram?.active ? ram : explorer?.active ? explorer : null;
    const pts = guided ? guided.fitAlcoves.flatMap(a => vertices(a).map(toCartesian)) : freePaths.paths.flatMap(({ walk }) => walk.nodes.flatMap(node => {
        if (node.action !== 'fold')
            return [node.point];
        const wall = edges(node.alcove).find(edge => edge.type === node.via);
        return [node.point, toCartesian(wall.start), toCartesian(wall.end)];
    }));
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of pts) {
        minU = Math.min(minU, p.u);
        maxU = Math.max(maxU, p.u);
        minV = Math.min(minV, p.v);
        maxV = Math.max(maxV, p.v);
    }
    const rangeU = Math.max(maxU - minU, 1.9), rangeV = Math.max(maxV - minV, 1.9);
    const scale = Math.min(maxScale, Math.max(3, Math.min((w - 2 * pad) / rangeU, (h - 2 * pad) / rangeV)));
    const u = (minU + maxU) / 2, v = (minV + maxV) / 2;
    return { ox: w / 2 - u * scale, oy: h / 2 - v * scale, scale };
}
function polygonPoints(a, cam) {
    return vertices(a).map(v => { const p = scenePoint(toCartesian(v), cam); return `${n(p.x)},${n(p.y)}`; }).join(' ');
}
function edgeKey(edge) {
    const a = `${edge.start.x}:${edge.start.y}`, b = `${edge.end.x}:${edge.end.y}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}
function visibleAlcoves(w, h, cam) {
    const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => toRoot(cartesianAt(x, y, cam)));
    let minI = Math.floor(Math.min(...corners.map(p => p.x))) - 2;
    let maxI = Math.ceil(Math.max(...corners.map(p => p.x))) + 2;
    let minJ = Math.floor(Math.min(...corners.map(p => p.y))) - 2;
    let maxJ = Math.ceil(Math.max(...corners.map(p => p.y))) + 2;
    // Avoid arbitrarily huge DOM work if someone zooms out far.
    const maxSpan = 120;
    if (maxI - minI > maxSpan) {
        const mid = (minI + maxI) / 2;
        minI = Math.floor(mid - maxSpan / 2);
        maxI = Math.ceil(mid + maxSpan / 2);
    }
    if (maxJ - minJ > maxSpan) {
        const mid = (minJ + maxJ) / 2;
        minJ = Math.floor(mid - maxSpan / 2);
        maxJ = Math.ceil(mid + maxSpan / 2);
    }
    const tiles = [];
    for (let i = minI; i <= maxI; i++)
        for (let j = minJ; j <= maxJ; j++) {
            tiles.push({ i, j, half: 'L' }, { i, j, half: 'U' });
        }
    return tiles;
}
function nodeSVG(cam, w, h, interactive = true) {
    const nodes = displayedNodes(), current = nodes[nodes.length - 1].alcove, steps = nodes.length - 1;
    const allowed = new Map();
    if (interactive && isFreeDrawing())
        for (const edge of edges(current))
            allowed.set(alcoveKey(edge.adjacent), edge.type);
    const visible = visibleAlcoves(w, h, cam);
    const uniqueEdges = new Map();
    const bg = [];
    const hits = [];
    for (const a of visible) {
        const key = alcoveKey(a), poly = polygonPoints(a, cam);
        if (key === '0,0,L')
            bg.push(`<polygon points="${poly}" fill="#f5d67c" fill-opacity="0.68"/>`);
        if (allowed.has(key))
            bg.push(`<polygon points="${poly}" fill="#cddfcd" fill-opacity="0.38"/>`);
        if (key === alcoveKey(current) && (steps > 0 || ram?.active || lp?.active))
            bg.push(`<polygon points="${poly}" fill="#cfddd0" fill-opacity="0.45"/>`);
        if (explorer?.active && explorer.gallery && key === alcoveKey(explorer.gallery.target))
            bg.push(`<polygon points="${poly}" fill="#c7b6e4" fill-opacity="0.65" stroke="#8b70b1" stroke-width="2"/>`);
        if (ram?.active && ram.reference && key === alcoveKey(ram.reference.target))
            bg.push(`<polygon points="${poly}" fill="#c7b6e4" fill-opacity="0.65" stroke="#8b70b1" stroke-width="2"/>`);
        if (lp?.active && lp.reference && key === alcoveKey(lp.reference.target))
            bg.push(`<polygon points="${poly}" fill="#b7d6d1" fill-opacity="0.55" stroke="#488b83" stroke-width="2"/>`);
        if (interactive)
            hits.push(`<polygon points="${poly}" data-alcove="${key}" fill="transparent" stroke="none" aria-label="alcove ${key}"/>`);
        for (const e of edges(a))
            if (!uniqueEdges.has(edgeKey(e)))
                uniqueEdges.set(edgeKey(e), e);
    }
    const grid = [];
    for (const e of uniqueEdges.values()) {
        const a = scenePoint(toCartesian(e.start), cam), b = scenePoint(toCartesian(e.end), cam);
        const important = !!crossedWall(A0, e.adjacent) && e.start.x >= 0 && e.start.y >= 0 && e.end.x >= 0 && e.end.y >= 0;
        grid.push(`<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${COLORS[e.type]}" stroke-width="${important ? '1.2' : '0.88'}" stroke-opacity="${important ? '.8' : '.5'}"/>`);
    }
    // Strongly render the fundamental alcove boundary, including labels.
    const fundamental = edges(A0).map(e => {
        const a = scenePoint(toCartesian(e.start), cam), b = scenePoint(toCartesian(e.end), cam);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const ctr = scenePoint(center(A0), cam);
        const dx = mx - ctr.x, dy = my - ctr.y, len = Math.hypot(dx, dy) || 1;
        const tx = mx + dx / len * 13, ty = my + dy / len * 13;
        return `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${COLORS[e.type]}" stroke-width="3"/><text x="${n(tx)}" y="${n(ty)}" font-size="12" font-family="Georgia,serif" fill="${COLORS[e.type]}" text-anchor="middle">s${SUB[e.type]}</text>`;
    }).join('');
    const centroid = scenePoint(center(A0), cam);
    const tags = `<text x="${n(centroid.x - 12)}" y="${n(centroid.y - 20)}" font-family="Georgia,serif" font-style="italic" font-size="19" fill="#9e8142" text-anchor="middle">A₀</text>`;
    const route = [];
    if (lp?.active) {
        if (lp.referencePath)
            route.push(foldedRouteSVG(lp.referencePath, cam, '#7692ad', false, true));
        if (lp.overlay)
            for (const item of lp.page)
                route.push(foldedRouteSVG(item.path, cam, '#6baba2', false));
        route.push(foldedRouteSVG(lp.path, cam, '#303834', true));
        if (lp.reference) {
            const target = scenePoint(center(lp.reference.target), cam);
            const vertex = scenePoint(toCartesian(lp.reference.terminalVertex), cam);
            route.push(`<text x="${n(target.x)}" y="${n(target.y + 30)}" text-anchor="middle" font-size="12" fill="#397c74" paint-order="stroke" stroke="#fbfaf7" stroke-width="3">Reference A₀ − λ</text><circle cx="${n(vertex.x)}" cy="${n(vertex.y)}" r="5" fill="#397c74" stroke="#fffefa" stroke-width="2"/><text x="${n(vertex.x - 10)}" y="${n(vertex.y - 12)}" text-anchor="end" font-size="12" fill="#397c74" paint-order="stroke" stroke="#fbfaf7" stroke-width="3">Marked vertex −λ</text>`);
        }
        for (const edge of edges(current)) {
            const p = scenePoint(toCartesian({ x: (edge.start.x + edge.end.x) / 2, y: (edge.start.y + edge.end.y) / 2 }), cam);
            route.push(`<text x="${n(p.x + 7)}" y="${n(p.y - 8)}" font-size="13" fill="${COLORS[edge.type]}" paint-order="stroke" stroke="#fbfaf7" stroke-width="3">s${SUB[edge.type]}</text>`);
        }
        const next = lp.next;
        if (next) {
            const a = scenePoint(toCartesian(next.wall.start), cam), b = scenePoint(toCartesian(next.wall.end), cam);
            route.push(`<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="#fffefa" stroke-width="9"/><line data-current-lp-wall="true" x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${COLORS[next.wall.type]}" stroke-width="5"/><text x="${n((a.x + b.x) / 2 + 10)}" y="${n((a.y + b.y) / 2 - 15)}" font-size="12" fill="#303834" paint-order="stroke" stroke="#fffefa" stroke-width="4">Actual s${SUB[next.wall.type]} · ${next.wall.equation}</text>`);
        }
    }
    else if (ram?.active) {
        if (ram.referencePath)
            route.push(foldedRouteSVG(ram.referencePath, cam, '#7692ad', false, true));
        if (ram.overlay)
            for (const item of ram.page)
                route.push(foldedRouteSVG(item.path, cam, '#9b80b1', false));
        route.push(foldedRouteSVG(ram.path, cam, '#303834', true));
        if (ram.reference) {
            const target = scenePoint(center(ram.reference.target), cam);
            route.push(`<text x="${n(target.x)}" y="${n(target.y + 30)}" text-anchor="middle" font-size="12" fill="#735295" paint-order="stroke" stroke="#fbfaf7" stroke-width="3">A₀ + λ</text>`);
        }
        for (const edge of edges(current)) {
            const p = scenePoint(toCartesian({ x: (edge.start.x + edge.end.x) / 2, y: (edge.start.y + edge.end.y) / 2 }), cam);
            route.push(`<text x="${n(p.x + 7)}" y="${n(p.y - 8)}" font-size="13" fill="${COLORS[edge.type]}" paint-order="stroke" stroke="#fbfaf7" stroke-width="3">s${SUB[edge.type]}</text>`);
        }
        const next = ram.next;
        if (next) {
            const a = scenePoint(toCartesian(next.wall.start), cam), b = scenePoint(toCartesian(next.wall.end), cam);
            const p = scenePoint(center(current), cam), neighbor = scenePoint(center(next.wall.adjacent), cam);
            route.push(`<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="#fffefa" stroke-width="9"/><line data-current-ram-wall="true" x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${COLORS[next.wall.type]}" stroke-width="5"/><text x="${n((a.x + b.x) / 2 + 10)}" y="${n((a.y + b.y) / 2 - 15)}" font-size="12" fill="#303834" paint-order="stroke" stroke="#fffefa" stroke-width="4">s${SUB[next.wall.type]} · ${next.wall.equation}</text><text x="${n(p.x)}" y="${n(p.y - 20)}" text-anchor="middle" font-size="11" fill="#42653e" paint-order="stroke" stroke="#fffefa" stroke-width="3">Current ${next.side > 0 ? '+' : '−'}</text><text x="${n(neighbor.x)}" y="${n(neighbor.y + 23)}" text-anchor="middle" font-size="11" fill="#727b7e" paint-order="stroke" stroke="#fffefa" stroke-width="3">${next.side > 0 ? 'Negative −' : 'Positive +'}</text>`);
        }
    }
    else if (explorer?.active && explorer.path && explorer.reference && explorer.gallery) {
        route.push(foldedRouteSVG(explorer.reference, cam, '#7692ad', false, true));
        if (explorer.overlay)
            for (const item of explorer.page)
                route.push(foldedRouteSVG(item.path, cam, '#9b80b1', false));
        route.push(foldedRouteSVG(explorer.path, cam, '#303834', true));
        const target = scenePoint(center(explorer.gallery.target), cam);
        route.push(`<text x="${n(target.x)}" y="${n(target.y + 30)}" text-anchor="middle" font-size="12" font-family="Georgia,serif" fill="#735295" paint-order="stroke" stroke="#fbfaf7" stroke-width="3">A₀ − λ</text>`);
    }
    else {
        route.push(freeRoutesSVG(freePaths.paths, freePaths.active.id, p => scenePoint(p, cam), cam.scale));
        if (interactive && tool === 'fold') {
            for (const edge of edges(current)) {
                const a = scenePoint(toCartesian(edge.start), cam), b = scenePoint(toCartesian(edge.end), cam);
                const line = `x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}"`;
                hits.push(`<line ${line} stroke="${COLORS[edge.type]}" stroke-width="3.5" pointer-events="none"/><line ${line} data-fold-wall="${edge.type}" stroke="transparent" stroke-width="${n(Math.min(18, cam.scale * .28))}" pointer-events="stroke"><title>Fold at s${SUB[edge.type]} · ${edge.equation}</title></line>`);
            }
        }
    }
    return `<defs><marker id="walk-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#303834"/></marker><marker id="fold-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#a3558b"/></marker></defs><rect width="${w}" height="${h}" fill="#fbfaf7"/><g>${bg.join('')}</g><g>${grid.join('')}</g><g>${fundamental}${tags}</g><g class="hit-regions">${hits.join('')}</g><g pointer-events="none">${route.join('')}</g>`;
}
function foldedRouteSVG(path, cam, color, selected, dashed = false) {
    const parts = [];
    for (const step of path.steps) {
        const a = scenePoint(center(step.from), cam), b = scenePoint(center(step.to), cam);
        let d;
        if (step.kind === 'fold') {
            const mid = scenePoint(toCartesian({ x: (step.wall.start.x + step.wall.end.x) / 2, y: (step.wall.start.y + step.wall.end.y) / 2 }), cam);
            const dx = mid.x - a.x, dy = mid.y - a.y, len = Math.hypot(dx, dy) || 1;
            const offset = Math.min(6, cam.scale * .035), px = -dy / len * offset, py = dx / len * offset;
            d = `M ${n(a.x + px)} ${n(a.y + py)} Q ${n(mid.x + px)} ${n(mid.y + py)} ${n(mid.x)} ${n(mid.y)} Q ${n(mid.x - px)} ${n(mid.y - py)} ${n(a.x - px)} ${n(a.y - py)}`;
            if (selected)
                parts.push(`<circle cx="${n(mid.x)}" cy="${n(mid.y)}" r="4" fill="#a3558b"/><text x="${n(mid.x + 8)}" y="${n(mid.y - 6)}" font-size="10" fill="#93487c" paint-order="stroke" stroke="#fbfaf7" stroke-width="3">${step.index}: f${SUB[step.type]}${step.sign > 0 ? '⁺' : '⁻'}</text>`);
        }
        else
            d = `M ${n(a.x)} ${n(a.y)} L ${n(b.x)} ${n(b.y)}`;
        parts.push(`<path d="${d}" fill="none" stroke="${selected && step.kind === 'fold' ? '#a3558b' : color}" stroke-width="${selected ? 2.5 : dashed ? 2 : 1.5}" stroke-opacity="${selected ? 1 : dashed ? .75 : .22}"${dashed ? ' stroke-dasharray="6 5"' : ''}${selected ? ` marker-end="url(#${step.kind === 'fold' ? 'fold-arrow' : 'walk-arrow'})"` : ''}/>`);
        if (selected && step.kind === 'cross')
            parts.push(`<text x="${n((a.x + b.x) / 2 + 6)}" y="${n((a.y + b.y) / 2 - 5)}" font-size="10" fill="#303834" paint-order="stroke" stroke="#fbfaf7" stroke-width="3">${step.index}${ram?.active || lp?.active ? `: c${SUB[step.type]}${step.sign > 0 ? '⁺' : '⁻'}` : ''}</text>`);
    }
    if (selected) {
        const start = scenePoint(center(path.nodes[0]), cam), end = scenePoint(center(path.nodes[path.nodes.length - 1]), cam);
        parts.push(`<circle cx="${n(start.x)}" cy="${n(start.y)}" r="6" fill="#dfb453" stroke="#fffefa" stroke-width="2"/><circle cx="${n(end.x)}" cy="${n(end.y)}" r="5" fill="#303834" stroke="#fffefa" stroke-width="2"/>`);
    }
    return parts.join('');
}
function render() {
    syncMode();
    const { w, h } = dims();
    if (!cameraReady) {
        camera = initialCamera(w, h);
        cameraReady = true;
    }
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = nodeSVG(camera, w, h);
    const nodes = displayedNodes(), steps = nodes.length - 1, current = nodes[steps].alcove;
    $('step-count').textContent = String(steps);
    const length = ram?.active ? galleryDistance(nodes[0].alcove, current) : coxeterLength(current);
    $('length-count').textContent = String(length);
    $('unique-count').textContent = String(new Set(nodes.map(nd => alcoveKey(nd.alcove))).size);
    const path = currentFoldPath();
    const walk = freePaths.active.walk;
    const foldCount = path?.folds ?? walk.nodes.filter(node => node.action === 'fold').length;
    const foldSummary = `${foldCount} ${foldCount === 1 ? 'fold' : 'folds'}`;
    if (isFreeDrawing())
        renderFreeControls();
    const chips = $('word-chips');
    chips.innerHTML = path ? `<span class="fold-action-word">${actionLabel(path)}</span>` : walk.steps ? walk.nodes.slice(1).map(node => {
        const symbol = node.action === 'fold' ? 'f' : foldCount ? 'c' : 's';
        return `<span class="word-chip s${node.via}" title="${node.action === 'fold' ? 'Fold' : 'Cross'} at s${SUB[node.via]}">${symbol}${SUB[node.via]}</span>`;
    }).join('') : '<span class="empty-word">e</span>';
    const showingActions = !!path || foldCount > 0;
    $('copy-word').textContent = showingActions ? '▣ Copy steps' : '▣ Copy word';
    chips.closest('section').querySelector('h3').textContent = showingActions ? 'Walk steps' : 'Current word';
    const badge = $('reduced-badge');
    const reduced = steps === length;
    if (lp?.active)
        badge.textContent = `${lp.walk?.complete ? 'Complete' : 'In progress'} · LP · ${foldSummary}`;
    else if (ram?.active)
        badge.textContent = `${ram.walk?.complete ? 'Complete' : 'In progress'} · ${foldSummary}`;
    else
        badge.textContent = foldCount ? foldSummary : reduced ? 'Reduced path' : 'Nonreduced path';
    badge.classList.toggle('not-reduced', !reduced);
    $('endpoint-label').textContent = path ? `${(ram?.active && !ram.walk?.complete) || (lp?.active && !lp.walk?.complete) ? 'Current alcove' : 'Final alcove'} ${alcoveKey(current)}` : `Path ${freePaths.active.id} · Endpoint ${alcoveKey(current)}`;
    $('undo-btn').toggleAttribute('disabled', !!path || !walk.canUndo);
    $('redo-btn').toggleAttribute('disabled', !!path || !walk.canRedo);
    $('clear-btn').toggleAttribute('disabled', !!path || walk.steps === 0);
    const multiple = isFreeDrawing() && freePaths.paths.length > 1;
    $('fit-btn').textContent = multiple ? '⛶ Fit paths' : '⛶ Fit path';
    $('fit-btn').title = multiple ? 'Show all drawing paths' : 'Show the entire path';
    $('zoom-label').textContent = `${Math.round(camera.scale / 122 * 100)}%`;
    $('canvas-footnote').textContent = path ? 'Dashed: reference · Purple: folds · Faint: page walks · Click the log to locate' : `Path ${freePaths.active.id} · ${walk.steps} steps · ${foldSummary}`;
    $('drawing-status').textContent = lp?.active ? 'LP admissible foldings' : ram?.active ? 'Ram walk' : explorer?.active ? 'Folded walk browser' : tool === 'pan' ? 'Pan mode' : tool === 'fold' ? 'Fold mode' : 'Draw mode';
    document.querySelector('.canvas-heading h1').textContent = lp?.active ? 'LP Admissible Foldings' : ram?.active ? 'Ram Alcove Walk Mode' : explorer?.active ? 'Weight → reduced path → folded walks' : `Free Drawing · Path ${freePaths.active.id}`;
    document.querySelector('.canvas-heading p').textContent = lp?.active ? 'Geometry starts at A₀; folds use the original reference reflections for Bruhat covers.' : ram?.active ? 'The thick line marks the current wall. Choose an allowed crossing or fold.' : explorer?.active ? 'The purple alcove is A₀ − λ. Folded walks may have different endpoints.' : tool === 'fold' ? 'Click a highlighted wall or its neighbor to fold.' : tool === 'pan' ? 'Drag to pan. Select Draw to continue the path.' : 'Click an adjacent alcove to cross its wall.';
    const live = document.querySelector('.live-dot');
    live.innerHTML = `<i></i>${lp?.active ? 'LP mode' : ram?.active ? 'Ram mode' : explorer?.active ? 'Folded walks' : 'Free Drawing'}`;
    const next = ram?.active ? ram.next : null;
    $('ram-choice-popup').hidden = !next?.canFold;
    if (next?.canFold) {
        $('ram-popup-info').textContent = `Step ${ram.walk.position + 1} · ${next.wall.equation} · Current ${next.side > 0 ? 'positive' : 'negative'} side / Reference ${next.referenceSign > 0 ? '+' : '−'}`;
        $('ram-popup-cross').textContent = $('ram-cross').textContent;
        $('ram-popup-fold').textContent = $('ram-fold').textContent;
    }
    renderLog();
}
function toSubscript(n) { return String(n).replace(/[0-9]/g, d => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]); }
function renderLog() {
    const html = [];
    const path = currentFoldPath();
    const nodes = displayedNodes();
    for (let k = 0; k < nodes.length; k++) {
        const nd = nodes[k];
        if (k === 0) {
            html.push(`<li data-step="0"><span class="log-index">0</span><span class="log-main"><span class="log-title">${ram?.active ? 'wA₀' : 'A₀'}</span><br/><span class="log-subtitle">${ram?.active ? alcoveKey(nd.alcove) : 'Fundamental alcove'}</span></span><span class="log-type">Start</span></li>`);
            continue;
        }
        const previous = nodes[k - 1].alcove;
        const foldStep = path?.steps[k - 1];
        const freeFold = nd.action === 'fold';
        const edge = foldStep?.wall ?? (freeFold ? edges(previous).find(edge => edge.type === nd.via) : crossedWall(previous, nd.alcove));
        if (foldStep) {
            const side = foldStep.kind === 'fold' ? foldStep.sign : -foldStep.sign;
            html.push(`<li data-step="${k}"><span class="log-index">${k}</span><span class="log-main"><span class="log-title">${foldStep.kind === 'fold' ? '↶ Fold · Stay in the current alcove' : '→ Cross'} (${foldStep.sign > 0 ? '+' : '−'})</span><br/><span class="log-subtitle">${edge?.equation} · ${alcoveKey(nd.alcove)}${lp?.active ? `<br/>Reference r̄${k} = ${permutationKey(lp.reference.reflections[k - 1].finite)} · v: ${permutationKey(lp.path.steps[k - 1].vBefore)} → ${permutationKey(lp.path.steps[k - 1].vAfter)}` : ''}${ram?.active ? `<br/>Current side ${side > 0 ? '+' : '−'} · Reference ε = ${ram.reference.signs[k - 1] > 0 ? '+' : '−'}` : ''}</span></span><span class="log-type t${nd.via}">${foldStep.kind === 'fold' ? 'f' : 'c'}${SUB[nd.via]}${foldStep.sign > 0 ? '⁺' : '⁻'}</span></li>`);
            continue;
        }
        html.push(`<li data-step="${k}"><span class="log-index">${k}</span><span class="log-main"><span class="log-title">${freeFold ? 'Fold · Stay in this alcove' : `Cross · A${toSubscript(k - 1)} → A${toSubscript(k)}`}</span><br/><span class="log-subtitle">${edge?.equation ?? '—'} · ${alcoveKey(nd.alcove)}</span></span><span class="log-type t${nd.via}">${freeFold ? 'f' : 's'}${SUB[nd.via]}</span></li>`);
    }
    $('walk-log').innerHTML = html.join('');
}
function persist() { try {
    localStorage.setItem(STORAGE, JSON.stringify({ freePaths: freePaths.toJSON(), camera, snap }));
}
catch { /* Storage optional */ } }
function update() { render(); persist(); }
function syncToolButtons() {
    for (const button of document.querySelectorAll('[data-tool]')) {
        const selected = button.dataset.tool === tool;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
    }
    svg.classList.toggle('pan-cursor', tool === 'pan' || spaceHeld);
}
function setTool(next) {
    if (next === 'fold' && !isFreeDrawing())
        return;
    tool = next;
    render();
}
function renderFreeControls() {
    const list = $('free-path-list');
    // Keep the path buttons in place across canvas redraws and keyboard selections.
    if (list.childElementCount !== freePaths.paths.length) {
        list.innerHTML = freePaths.paths.map(path => `<button type="button" data-free-path-id="${path.id}" style="--path-color:${path.color}"><i aria-hidden="true"></i>Path ${path.id}</button>`).join('');
    }
    for (const button of list.querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(Number(button.dataset.freePathId) === freePaths.active.id));
    }
    $('clear-free-paths').toggleAttribute('disabled', freePaths.paths.length === 1 && !freePaths.active.walk.steps);
    for (const edge of edges(freePaths.active.walk.current)) {
        const button = document.querySelector(`[data-free-fold="${edge.type}"]`);
        button.title = `Fold at s${SUB[edge.type]} · ${edge.equation}`;
    }
}
function foldAt(type) {
    if (!isFreeDrawing())
        return;
    try {
        freePaths.active.walk.fold(type);
        update();
    }
    catch (error) {
        showToast(error.message);
    }
}
function setZoom(factor, px, py) {
    const { w, h } = dims(), x = px ?? w / 2, y = py ?? h / 2;
    const world = cartesianAt(x, y, camera);
    const scale = clamp(camera.scale * factor, 3, 400);
    camera = { scale, ox: x - world.u * scale, oy: y - world.v * scale };
    update();
}
function recenter() { const { w, h } = dims(); camera = initialCamera(w, h); update(); }
function fitPath() { const { w, h } = dims(); camera = fitCamera(w, h); update(); }
function onAlcoveClick(key, e) {
    if (tool === 'pan' || spaceHeld || draggedRecently)
        return;
    if (lp.active) {
        showToast('Use Cross / Fold for LP steps. The input u only starts the Bruhat chain.');
        return;
    }
    if (ram.active) {
        showToast('Use Crossing / Folding for the current wall. Drag to pan the canvas.');
        return;
    }
    if (explorer.active) {
        showToast('Browsing folded walks. Select Return to Free Drawing to draw manually.');
        return;
    }
    const walk = freePaths.active.walk;
    const a = fromKey(key), edge = crossedWall(walk.current, a);
    if (!edge) {
        showToast('Choose a neighbor sharing a wall with the current alcove.');
        return;
    }
    if (tool === 'fold') {
        foldAt(edge.type);
        return;
    }
    const pixel = mousePoint(e);
    const point = snap ? center(a) : cartesianAt(pixel.x, pixel.y, camera);
    try {
        walk.append(a, point);
        update();
    }
    catch (error) {
        showToast(error.message);
    }
}
function loadWord(word) {
    try {
        freePaths.active.walk.setWord(word);
        explorer.deactivate();
        ram.deactivate();
        lp.deactivate();
        fitPath();
        showToast(`Drew ${word.length} steps: ${formatWord(word)}`);
    }
    catch (err) {
        showToast(err.message);
    }
}
async function copy(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard.');
    }
    catch {
        showToast('Clipboard access is unavailable. Select and copy the text manually.');
    }
}
function download(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
}
function exportSVG() {
    // Export a *new* scene with a camera that fits the whole path, not the current crop.
    const w = 1200, h = 900, c = fitCamera(w, h, 115, 250);
    const content = nodeSVG(c, w, h, false);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${content}</svg>`;
    download('alcove-path-A2.svg', xml, 'image/svg+xml;charset=utf-8');
    showToast('SVG exported.');
}
function restore() {
    try {
        const text = localStorage.getItem(STORAGE);
        if (!text)
            return;
        const data = JSON.parse(text);
        freePaths.restore(data?.freePaths ? JSON.stringify(data.freePaths) : text);
        if (typeof data?.snap === 'boolean')
            snap = data.snap;
        if (data?.camera && ['ox', 'oy', 'scale'].every(k => Number.isFinite(data.camera[k])) && data.camera.scale >= 3 && data.camera.scale <= 500) {
            camera = data.camera;
            cameraReady = true;
        }
    }
    catch { /* Ignore malformed local storage */ }
}
explorer = new FoldExplorer(fit => { if (explorer.active) {
    ram?.deactivate();
    lp?.deactivate();
} if (fit)
    fitPath();
else
    update(); });
ram = new RamExplorer(fit => { if (ram.active) {
    explorer.deactivate();
    lp?.deactivate();
} if (fit)
    fitPath();
else
    update(); });
lp = new LPExplorer(fit => { if (lp.active) {
    explorer.deactivate();
    ram.deactivate();
} if (fit)
    fitPath();
else
    update(); });
restore();
explorer.restore();
ram.restore();
lp.restore();
if (lp.active) {
    ram.deactivate();
    explorer.deactivate();
}
else if (ram.active)
    explorer.deactivate();
$('open-free-mode').addEventListener('click', () => { lp.deactivate(); ram.deactivate(); explorer.deactivate(); fitPath(); });
$('open-ram-mode').addEventListener('click', () => { lp.deactivate(); explorer.deactivate(); ram.activate(); });
$('open-lp-mode').addEventListener('click', () => { ram.deactivate(); explorer.deactivate(); lp.activate(); });
$('ram-popup-cross').addEventListener('click', () => ram.perform('cross'));
$('ram-popup-fold').addEventListener('click', () => ram.perform('fold'));
$('snap-checkbox').checked = snap;
// Mouse / pen / touch interaction.
svg.addEventListener('click', e => {
    if (draggedRecently) {
        draggedRecently = false;
        return;
    }
    const target = e.target;
    const wall = target.closest('[data-fold-wall]');
    if (wall && tool === 'fold' && !spaceHeld) {
        foldAt(Number(wall.dataset.foldWall));
        return;
    }
    const hit = target.closest('[data-alcove]');
    if (hit?.dataset.alcove)
        onAlcoveClick(hit.dataset.alcove, e);
});
svg.addEventListener('pointerdown', e => {
    const hit = e.target.closest('[data-alcove], [data-fold-wall]');
    if (lp.active || ram.active || explorer.active || tool === 'pan' || spaceHeld || !hit) {
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: camera.ox, oy: camera.oy, moved: false };
        svg.setPointerCapture(e.pointerId);
        svg.classList.add('is-dragging');
    }
});
svg.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id)
        return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 3)
        drag.moved = true;
    camera.ox = drag.ox + dx;
    camera.oy = drag.oy + dy;
    render();
});
function endDrag(e) {
    if (!drag || e.pointerId !== drag.id)
        return;
    if (drag.moved)
        draggedRecently = true;
    drag = null;
    svg.classList.remove('is-dragging');
    persist();
    if (draggedRecently)
        setTimeout(() => { draggedRecently = false; }, 20);
}
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);
svg.addEventListener('wheel', e => { e.preventDefault(); const p = mousePoint(e); setZoom(Math.exp(-e.deltaY * .0012), p.x, p.y); }, { passive: false });
for (const b of document.querySelectorAll('[data-tool]'))
    b.addEventListener('click', () => setTool(b.dataset.tool));
$('zoom-in').addEventListener('click', () => setZoom(1.22));
$('zoom-out').addEventListener('click', () => setZoom(1 / 1.22));
$('recenter-btn').addEventListener('click', recenter);
$('fit-btn').addEventListener('click', fitPath);
$('undo-btn').addEventListener('click', () => { if (freePaths.active.walk.undo())
    update(); });
$('redo-btn').addEventListener('click', () => { if (freePaths.active.walk.redo())
    update(); });
$('clear-btn').addEventListener('click', () => { freePaths.active.walk.clear(); update(); showToast(`Path ${freePaths.active.id} cleared.`); });
$('add-free-path').addEventListener('click', () => {
    if (!isFreeDrawing())
        return;
    freePaths.add();
    tool = 'draw';
    fitPath();
});
$('free-path-list').addEventListener('click', e => {
    const button = e.target.closest('[data-free-path-id]');
    if (button && isFreeDrawing() && freePaths.select(Number(button.dataset.freePathId)))
        fitPath();
});
$('clear-free-paths').addEventListener('click', () => {
    if (!isFreeDrawing())
        return;
    freePaths.clearAll();
    tool = 'draw';
    recenter();
    showToast('All free-drawing paths cleared.');
});
for (const button of document.querySelectorAll('[data-free-fold]')) {
    button.addEventListener('click', () => foldAt(Number(button.dataset.freeFold)));
}
$('snap-checkbox').addEventListener('change', e => { snap = e.target.checked; persist(); });
$('word-form').addEventListener('submit', e => { e.preventDefault(); try {
    loadWord(parseWord($('word-input').value));
}
catch (err) {
    showToast(err.message);
} });
$('load-example').addEventListener('click', () => {
    const input = $('example-select');
    if (!input.value) {
        showToast('Choose an example path first.');
        return;
    }
    loadWord(input.value.split(',').map(x => Number(x)));
});
$('copy-word').addEventListener('click', () => {
    const path = currentFoldPath(), walk = freePaths.active.walk;
    const steps = walk.nodes.some(node => node.action === 'fold');
    const word = steps ? walk.nodes.slice(1).map(node => `${node.action === 'fold' ? 'f' : 'c'}${SUB[node.via]}`).join(' ') : formatWord(walk.word);
    void copy(path ? actionLabel(path) : word);
});
$('prompt-btn').addEventListener('click', () => void copy(PROJECT_PROMPT));
$('export-btn').addEventListener('click', exportSVG);
$('walk-log').addEventListener('click', e => {
    const item = e.target.closest('[data-step]');
    if (!item)
        return;
    const idx = Number(item.dataset.step), node = displayedNodes()[idx];
    if (!node)
        return;
    const { w, h } = dims();
    camera.ox = w / 2 - camera.scale * node.point.u;
    camera.oy = h / 2 - camera.scale * node.point.v;
    update();
});
$('export-json').addEventListener('click', () => { download('alcove-path-A2.json', JSON.stringify((lp.active ? lp.exportData() : null) ?? (ram.active ? ram.exportData() : null) ?? explorer.exportData() ?? freeDrawingExport(), null, 2), 'application/json;charset=utf-8'); showToast('JSON exported.'); });
function freeDrawingExport() {
    const active = freePaths.active;
    return {
        rootSystem: 'A2_affine', convention: 'right action', mode: 'free-drawing', activePathId: active.id,
        nodes: active.walk.nodes, word: active.walk.crossingWord,
        paths: freePaths.paths.map(({ id, color, walk }) => ({ id, color, nodes: walk.nodes, word: walk.crossingWord, wallTypes: walk.word }))
    };
}
const dialog = $('help-dialog');
$('help-btn').addEventListener('click', () => dialog.showModal());
$('help-close').addEventListener('click', () => dialog.close());
$('help-ok').addEventListener('click', () => dialog.close());
document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !(e.target instanceof Element && e.target.closest('button,input,select,summary,dialog'))) {
        e.preventDefault();
        spaceHeld = true;
        svg.classList.add('pan-cursor');
    }
    if (e.ctrlKey || e.metaKey) {
        if (lp.active || ram.active || explorer.active || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)
            return;
        if (e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                if (freePaths.active.walk.redo())
                    update();
            }
            else {
                if (freePaths.active.walk.undo())
                    update();
            }
        }
        if (e.key.toLowerCase() === 'y') {
            e.preventDefault();
            if (freePaths.active.walk.redo())
                update();
        }
        return;
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || dialog.open)
        return;
    if (e.key.toLowerCase() === 'd')
        setTool('draw');
    if (e.key.toLowerCase() === 'f')
        setTool('fold');
    if (e.key.toLowerCase() === 'h')
        setTool('pan');
});
document.addEventListener('keyup', e => { if (e.code === 'Space') {
    spaceHeld = false;
    svg.classList.toggle('pan-cursor', tool === 'pan');
} });
window.addEventListener('blur', () => { spaceHeld = false; svg.classList.toggle('pan-cursor', tool === 'pan'); });
let previousView = null;
new ResizeObserver(() => {
    const current = dims();
    if (previousView) {
        if (current.w < previousView.w * .8 || current.h < previousView.h * .75) {
            camera = fitCamera(current.w, current.h, Math.min(90, current.w * .18));
        }
        else {
            const world = cartesianAt(previousView.w / 2, previousView.h / 2, camera);
            camera.ox = current.w / 2 - world.u * camera.scale;
            camera.oy = current.h / 2 - world.v * camera.scale;
        }
        persist();
    }
    previousView = current;
    render();
}).observe(svg);
render();
