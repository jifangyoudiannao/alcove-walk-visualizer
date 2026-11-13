import { A0, alcoveKey, center, crossedWall, neighborAcross, sameAlcove } from './affineA2.js';
function initialNode() { return { alcove: { ...A0 }, point: center(A0), via: null }; }
function copyNodes(nodes) {
    return nodes.map(n => ({ alcove: { ...n.alcove }, point: { ...n.point }, via: n.via }));
}
function validNodes(nodes) {
    if (!nodes.length || !sameAlcove(nodes[0].alcove, A0) || nodes[0].via !== null)
        return false;
    if (nodes.length > 501)
        return false;
    for (let k = 0; k < nodes.length; k++) {
        const n = nodes[k];
        if (!Number.isSafeInteger(n.alcove.i) || !Number.isSafeInteger(n.alcove.j) || !['U', 'L'].includes(n.alcove.half))
            return false;
        if (!Number.isFinite(n.point.u) || !Number.isFinite(n.point.v))
            return false;
        if (k > 0 && crossedWall(nodes[k - 1].alcove, n.alcove)?.type !== n.via)
            return false;
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
    append(alcove, point = center(alcove)) {
        const edge = crossedWall(this.current, alcove);
        if (!edge)
            return false;
        if (this.nodes.length >= 501)
            throw new Error('A walk can contain at most 500 steps');
        this.commit([...this.nodes, { alcove: { ...alcove }, point: { ...point }, via: edge.type }]);
        return true;
    }
    setWord(word) {
        if (word.length > 500)
            throw new Error('A walk can contain at most 500 steps');
        const result = [initialNode()];
        let a = A0;
        for (const s of word) {
            a = neighborAcross(a, s);
            result.push({ alcove: { ...a }, point: center(a), via: s });
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
    restore(json) {
        try {
            const nodes = JSON.parse(json);
            if (!Array.isArray(nodes) || !validNodes(nodes))
                return false;
            this.nodes = copyNodes(nodes);
            this.history = [];
            this.future = [];
            return true;
        }
        catch {
            return false;
        }
    }
}
