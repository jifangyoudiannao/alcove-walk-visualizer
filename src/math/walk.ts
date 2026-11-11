import { A0, alcoveKey, center, crossedWall, neighborAcross, sameAlcove, type Alcove, type CartesianPoint, type WallType } from './affineA2.js';

export interface WalkNode {
  alcove: Alcove;
  point: CartesianPoint; // Drawing position; may differ from alcove centroid.
  via: WallType | null; // Type of wall crossed to reach this alcove.
}
function initialNode(): WalkNode { return {alcove: {...A0}, point: center(A0), via: null}; }
function copyNodes(nodes: WalkNode[]): WalkNode[] {
  return nodes.map(n=>({alcove:{...n.alcove},point:{...n.point},via:n.via}));
}
function validNodes(nodes: WalkNode[]): boolean {
  if (!nodes.length || !sameAlcove(nodes[0].alcove, A0) || nodes[0].via !== null) return false;
  if (nodes.length > 501) return false;
  for (let k=0;k<nodes.length;k++) {
    const n=nodes[k];
    if (!Number.isSafeInteger(n.alcove.i) || !Number.isSafeInteger(n.alcove.j) || !['U','L'].includes(n.alcove.half)) return false;
    if (!Number.isFinite(n.point.u) || !Number.isFinite(n.point.v)) return false;
    if (k>0 && crossedWall(nodes[k-1].alcove,n.alcove)?.type!==n.via) return false;
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
  append(alcove: Alcove, point = center(alcove)): boolean {
    const edge = crossedWall(this.current,alcove);
    if (!edge) return false;
    if (this.nodes.length >= 501) throw new Error('路线最多包含 500 步');
    this.commit([...this.nodes, {alcove:{...alcove}, point:{...point}, via:edge.type}]);
    return true;
  }
  setWord(word: readonly WallType[]): void {
    if(word.length>500) throw new Error('路线最多包含 500 步');
    const result: WalkNode[] = [initialNode()];
    let a = A0;
    for (const s of word) {
      a=neighborAcross(a,s);
      result.push({alcove:{...a},point:center(a),via:s});
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
  restore(json: string): boolean {
    try { const nodes=JSON.parse(json); if(!Array.isArray(nodes) || !validNodes(nodes)) return false; this.nodes=copyNodes(nodes); this.history=[]; this.future=[]; return true; }
    catch { return false; }
  }
}
