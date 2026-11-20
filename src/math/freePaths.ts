import { Walk, type WalkNode } from './walk.js';

export interface FreePath {
  readonly id: number;
  readonly color: string;
  readonly walk: Walk;
}

const PALETTE = ['#713eb0', '#aa570c', '#363636', '#a02c98', '#745139', '#866607'];

function pathColor(id: number): string {
  if (id <= PALETTE.length) return PALETTE[id - 1];
  // Continue within the purple and amber families while varying lightness.
  const index = id - PALETTE.length - 1;
  const fraction = (Math.floor(index / 2) * 0.61803398875) % 1;
  const hue = (index % 2 === 0 ? 270 : 27) + fraction * 26;
  const lightness = 33 + ((index * 7) % 19);
  return `hsl(${hue} 65% ${lightness}%)`;
}

function makePath(id: number): FreePath {
  return {id, color: pathColor(id), walk: new Walk()};
}

interface SavedPath {
  id: number;
  nodes: WalkNode[];
}

export class FreePaths {
  private entries: FreePath[] = [makePath(1)];
  private activeIndex = 0;

  get paths(): readonly FreePath[] { return this.entries; }
  get active(): FreePath { return this.entries[this.activeIndex]; }

  add(): FreePath {
    const path = makePath(this.entries.length + 1);
    this.entries.push(path);
    this.activeIndex = this.entries.length - 1;
    return path;
  }

  select(id: number): boolean {
    if (!Number.isSafeInteger(id) || id < 1 || id > this.entries.length) return false;
    this.activeIndex = id - 1;
    return true;
  }

  clearAll(): void {
    this.entries = [makePath(1)];
    this.activeIndex = 0;
  }

  toJSON() {
    return {
      version: 1, activeId: this.active.id,
      paths: this.entries.map(({id, walk}) => ({id, nodes: walk.nodes})),
    };
  }

  serialize(): string { return JSON.stringify(this); }

  restore(json: string): boolean {
    try {
      const saved = JSON.parse(json);
      let paths: SavedPath[], activeId: number;
      if (Array.isArray(saved) || (Array.isArray(saved?.nodes) && !('paths' in saved))) {
        paths = [{id: 1, nodes: Array.isArray(saved) ? saved : saved.nodes}];
        activeId = 1;
      } else {
        if (saved.version !== 1 || !Array.isArray(saved.paths)) return false;
        paths = saved.paths;
        activeId = saved.activeId;
      }
      if (!Number.isSafeInteger(activeId) || activeId < 1 || activeId > paths.length) return false;
      const restored: FreePath[] = [];
      for (const entry of paths) {
        if (entry.id !== restored.length + 1 || !Array.isArray(entry.nodes)) return false;
        const path = makePath(entry.id);
        if (!path.walk.restoreNodes(entry.nodes)) return false;
        restored.push(path);
      }
      this.entries = restored;
      this.activeIndex = activeId - 1;
      return true;
    } catch {
      return false;
    }
  }
}
