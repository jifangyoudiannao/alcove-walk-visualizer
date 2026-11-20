import { A0, alcoveKey, center, crossedWall, neighborAcross, sameAlcove, type Alcove, type CartesianPoint, type WallType } from './affineA2.js';

export interface WalkNode {
  alcove: Alcove;
  point: CartesianPoint; // Drawing position; may differ from alcove centroid.
  via: WallType | null; // Wall used by this step; null at the initial node.
  action?: 'cross' | 'fold';
}
function initialNode(): WalkNode { return {alcove: {...A0}, point: center(A0), via: null}; }
function copyNodes(nodes: WalkNode[]): WalkNode[] {
  return nodes.map(n => {
    const copy: WalkNode = {alcove: {...n.alcove}, point: {...n.point}, via: n.via};
    if (n.via !== null) copy.action = n.action ?? 'cross'; // Older saves predate folds.
    return copy;
  });
}
function validNodes(nodes: WalkNode[]): boolean {
  if (!nodes[0]?.alcove || !sameAlcove(nodes[0].alcove, A0) || nodes[0].via !== null || nodes[0].action !== undefined) return false;
  if (nodes.length > 501) return false;
  for (let k=0;k<nodes.length;k++) {
    const n=nodes[k];
    if (!n?.alcove || !n.point) return false;
    if (!Number.isSafeInteger(n.alcove.i) || !Number.isSafeInteger(n.alcove.j) || !['U','L'].includes(n.alcove.half)) return false;
    if (!Number.isFinite(n.point.u) || !Number.isFinite(n.point.v)) return false;
    if (k === 0) continue;
    if (n.via !== 0 && n.via !== 1 && n.via !== 2) return false;
    const previous = nodes[k-1];
    if (n.action === 'fold') {
      if (!sameAlcove(previous.alcove, n.alcove) || n.point.u !== previous.point.u || n.point.v !== previous.point.v) return false;
    } else {
      if (n.action !== undefined && n.action !== 'cross') return false;
      if (crossedWall(previous.alcove, n.alcove)?.type !== n.via) return false;
    }
  }
  return true;
}
export class Walk {
  nodes: WalkNode[] = [initialNode()];
  private history: WalkNode[][] = [];
  private future: WalkNode[][] = [];
  get current(): Alcove { return this.nodes[this.nodes.length-1].alcove; }
  get steps(): number { return this.nodes.length - 1; }
  get word(): WallType[] { return this.nodes.slice(1).map(n=>n.via as WallType); }
  get crossingWord(): WallType[] { return this.nodes.slice(1).filter(n=>n.action !== 'fold').map(n=>n.via as WallType); }
  get canUndo(): boolean { return this.history.length>0; }
  get canRedo(): boolean { return this.future.length>0; }
  get distinct(): number { return new Set(this.nodes.map(n=>alcoveKey(n.alcove))).size; }
  private commit(next: WalkNode[]): void {
    if (!validNodes(next)) throw new Error('Invalid alcove walk');
    this.history.push(copyNodes(this.nodes));
    if (this.history.length>200) this.history.shift();
    this.nodes = copyNodes(next);
    this.future = [];
  }
  private appendStep(step: WalkNode): void {
    if (this.nodes.length >= 501) throw new Error('A walk can contain at most 500 steps');
    this.commit([...this.nodes, step]);
  }
  fold(wallType: WallType): boolean {
    if (wallType !== 0 && wallType !== 1 && wallType !== 2) return false;
    const {alcove, point} = this.nodes[this.steps];
    this.appendStep({alcove, point, via: wallType, action: 'fold'});
    return true;
  }
  append(alcove: Alcove, point = center(alcove)): boolean {
    const edge = crossedWall(this.current,alcove);
    if (!edge) return false;
    this.appendStep({alcove, point, via: edge.type, action: 'cross'});
    return true;
  }
  setWord(word: readonly WallType[]): void {
    if(word.length>500) throw new Error('A walk can contain at most 500 steps');
    const result: WalkNode[] = [initialNode()];
    let a = A0;
    for (const s of word) {
      a=neighborAcross(a,s);
      result.push({alcove:{...a},point:center(a),via:s,action:'cross'});
    }
    this.commit(result);
  }
  clear(): void { if (this.steps) this.commit([initialNode()]); }
  undo(): boolean {
    if(!this.history.length) return false;
    this.future.push(copyNodes(this.nodes));
    this.nodes=this.history.pop()!;
    return true;
  }
  redo(): boolean {
    if(!this.future.length) return false;
    this.history.push(copyNodes(this.nodes));
    this.nodes=this.future.pop()!;
    return true;
  }
  serialize(): string { return JSON.stringify(this.nodes); }
  restoreNodes(nodes: unknown): boolean {
    if (!Array.isArray(nodes) || !validNodes(nodes)) return false;
    this.nodes = copyNodes(nodes);
    this.history = [];
    this.future = [];
    return true;
  }
  restore(json: string): boolean {
    try { return this.restoreNodes(JSON.parse(json)); }
    catch { return false; }
  }
}
