import { A0, alcoveKey, center, crossedWall, neighborAcross, sameAlcove } from './affineA2.js';
function initialNode() { return { alcove: { ...A0 }, point: center(A0), via: null }; }
function copyNodes(nodes) {
    return nodes.map(n => {
        const copy = { alcove: { ...n.alcove }, point: { ...n.point }, via: n.via };
        if (n.via !== null)
            copy.action = n.action ?? 'cross'; // Older saves predate folds.
        return copy;
    });
}
function validNodes(nodes) {
    if (!nodes[0]?.alcove || !sameAlcove(nodes[0].alcove, A0) || nodes[0].via !== null || nodes[0].action !== undefined)
        return false;
    if (nodes.length > 501)
        return false;
    for (let k = 0; k < nodes.length; k++) {
        const n = nodes[k];
        if (!n?.alcove || !n.point)
            return false;
        if (!Number.isSafeInteger(n.alcove.i) || !Number.isSafeInteger(n.alcove.j) || !['U', 'L'].includes(n.alcove.half))
            return false;
        if (!Number.isFinite(n.point.u) || !Number.isFinite(n.point.v))
            return false;
        if (k === 0)
            continue;
        if (n.via !== 0 && n.via !== 1 && n.via !== 2)
            return false;
        const previous = nodes[k - 1];
        if (n.action === 'fold') {
            if (!sameAlcove(previous.alcove, n.alcove) || n.point.u !== previous.point.u || n.point.v !== previous.point.v)
                return false;
        }
        else {
            if (n.action !== undefined && n.action !== 'cross')
                return false;
            if (crossedWall(previous.alcove, n.alcove)?.type !== n.via)
                return false;
        }
    }
    return true;
}
export class Walk {
    nodes = [initialNode()];
    history = [];
    future = [];
    get current() { return this.nodes[this.nodes.length - 1].alcove; }
    get steps() { return this.nodes.length - 1; }
    get word() { return this.nodes.slice(1).map(n => n.via); }
    get crossingWord() { return this.nodes.slice(1).filter(n => n.action !== 'fold').map(n => n.via); }
    get canUndo() { return this.history.length > 0; }
    get canRedo() { return this.future.length > 0; }
    get distinct() { return new Set(this.nodes.map(n => alcoveKey(n.alcove))).size; }
    commit(next) {
        if (!validNodes(next))
            throw new Error('Invalid alcove walk');
        this.history.push(copyNodes(this.nodes));
        if (this.history.length > 200)
            this.history.shift();
        this.nodes = copyNodes(next);
        this.future = [];
    }
    appendStep(step) {
        if (this.nodes.length >= 501)
            throw new Error('A walk can contain at most 500 steps');
        this.commit([...this.nodes, step]);
    }
    fold(wallType) {
        if (wallType !== 0 && wallType !== 1 && wallType !== 2)
            return false;
        const { alcove, point } = this.nodes[this.steps];
        this.appendStep({ alcove, point, via: wallType, action: 'fold' });
        return true;
    }
    append(alcove, point = center(alcove)) {
        const edge = crossedWall(this.current, alcove);
        if (!edge)
            return false;
        this.appendStep({ alcove, point, via: edge.type, action: 'cross' });
        return true;
    }
    setWord(word) {
        if (word.length > 500)
            throw new Error('A walk can contain at most 500 steps');
        const result = [initialNode()];
        let a = A0;
        for (const s of word) {
            a = neighborAcross(a, s);
            result.push({ alcove: { ...a }, point: center(a), via: s, action: 'cross' });
        }
        this.commit(result);
    }
    clear() { if (this.steps)
        this.commit([initialNode()]); }
    undo() {
        if (!this.history.length)
            return false;
        this.future.push(copyNodes(this.nodes));
        this.nodes = this.history.pop();
        return true;
    }
    redo() {
        if (!this.future.length)
            return false;
        this.history.push(copyNodes(this.nodes));
        this.nodes = this.future.pop();
        return true;
    }
    serialize() { return JSON.stringify(this.nodes); }
    restoreNodes(nodes) {
        if (!Array.isArray(nodes) || !validNodes(nodes))
            return false;
        this.nodes = copyNodes(nodes);
        this.history = [];
        this.future = [];
        return true;
    }
    restore(json) {
        try {
            return this.restoreNodes(JSON.parse(json));
        }
        catch {
            return false;
        }
    }
}
