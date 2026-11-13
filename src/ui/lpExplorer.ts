import { A0, alcoveKey, parseWord, type Alcove } from '../math/affineA2.js';
import type { FoldPath } from '../math/folded.js';
import {
  LP_INPUTS, LPFamily, LPWalk, describeLPPath, lpReference, permutationKey,
  type LPPath, type LPReference, type Permutation,
} from '../math/lp.js';
import { actionLabel } from './foldExplorer.js';

const PAGE_SIZE = 6n;
const STORAGE = 'alcove-lp-explorer:v1';
const SUB = ['₀', '₁', '₂'];
const el = (id: string): HTMLElement => document.getElementById(id)!;
const field = (id: string): HTMLInputElement => el(id) as HTMLInputElement;
const select = (id: string): HTMLSelectElement => el(id) as HTMLSelectElement;
const rootLabel = (root: string): string => root === 'alpha1' ? 'α₁' : root === 'alpha2' ? 'α₂' : 'α₁ + α₂';
function termHTML(term: {mu: {a: number; b: number}; sign: number}, w: Permutation): string {
  const parts: string[] = [];
  for (const [coefficient, basis] of [[term.mu.a, 'ω₁'], [term.mu.b, 'ω₂']] as const) {
    if (!Number.isSafeInteger(coefficient)) throw new Error('K-theory weights must be exact integers');
    if (!coefficient) continue;
    const magnitude = Math.abs(coefficient);
    const body = `${magnitude === 1 ? '' : magnitude}${basis}`;
    parts.push(`${parts.length ? (coefficient < 0 ? ' − ' : ' + ') : (coefficient < 0 ? '−' : '')}${body}`);
  }
  // Only validated integers, fixed symbols and a validated S3 permutation
  // enter this HTML; JSON retains the engine's plain-text expression.
  return `${term.sign < 0 ? '−' : ''}x<sup>${parts.join('') || '0'}</sup> [O<sub>${permutationKey(w)}</sub>]`;
}
const initialPath = (): LPPath => ({
  nodes: [{...A0}], steps: [], folds: 0, positiveFolds: 0, negativeFolds: 0,
  bruhatChain: [[3, 2, 1]], outputW: [3, 2, 1], foldingPositions: [],
});
function integer(id: string): number {
  const text = field(id).value.trim();
  if (!/^[+-]?\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error('a and b must be safe integers.');
  return Number(text);
}
function downloadJSON(name: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Independent UI state for LP u-admissibility; geometry always starts at A0. */
export class LPExplorer {
  active = false;
  walk: LPWalk | null = null;
  reference: LPReference | null = null;
  referencePath: FoldPath | null = null;
  family: LPFamily | null = null;
  u: Permutation = [3, 2, 1];
  private customReference = false;
  overlay = true;
  dirty = false;
  selectedIndex: bigint | null = null;
  pageStart = 0n;
  page: {index: bigint; path: LPPath}[] = [];
  constructor(private onChange: (fit: boolean) => void) {
    el('lp-form').addEventListener('submit', event => {event.preventDefault(); this.attempt(() => {this.configure(); this.changed(true);});});
    for (const id of ['lp-a', 'lp-b', 'lp-u', 'lp-reference-input']) {
      el(id).addEventListener('input', () => {this.dirty = true; this.render(); this.onChange(false);});
    }
    el('lp-demo').addEventListener('click', () => this.attempt(() => {
      field('lp-a').value = '1'; field('lp-b').value = '0'; select('lp-u').value = '321';
      field('lp-reference-input').value = '';
      this.configure(); this.changed(true);
    }));
    el('lp-cross').addEventListener('click', () => this.perform('cross'));
    el('lp-fold').addEventListener('click', () => this.perform('fold'));
    el('lp-undo').addEventListener('click', () => this.attempt(() => {
      this.requireConfigured(); this.walk!.undo(); this.selectedIndex = null; this.changed(false);
    }));
    el('lp-reset').addEventListener('click', () => this.attempt(() => {
      this.requireConfigured(); this.walk!.reset(); this.selectedIndex = null; this.changed(true);
    }));
    el('lp-enumerate').addEventListener('click', () => this.attempt(() => {
      this.requireConfigured(); this.family = new LPFamily(this.reference!, this.u);
      this.pageStart = 0n; this.selectedIndex = null; this.loadPage(); this.changed(true);
    }));
    el('lp-list').addEventListener('click', event => {
      const card = (event.target as Element).closest<HTMLElement>('[data-lp-index]');
      if (card) this.attempt(() => this.selectPath(BigInt(card.dataset.lpIndex!)));
    });
    el('lp-prev').addEventListener('click', () => this.attempt(() => this.selectPath(this.pageStart - PAGE_SIZE)));
    el('lp-next').addEventListener('click', () => this.attempt(() => this.selectPath(this.pageStart + PAGE_SIZE)));
    el('lp-jump-form').addEventListener('submit', event => {
      event.preventDefault(); this.attempt(() => {
        const text = field('lp-jump').value.trim();
        if (!/^\d+$/.test(text)) throw new Error('Enter a path number starting at 1.');
        this.selectPath(BigInt(text) - 1n);
      });
    });
    el('lp-overlay').addEventListener('change', () => {this.overlay = field('lp-overlay').checked; this.changed(true);});
    el('lp-export-selected').addEventListener('click', () => this.attempt(() => {
      this.requireConfigured(); downloadJSON('lp-folding-A2.json', this.exportData());
    }));
    el('lp-export-all').addEventListener('click', () => this.attempt(() => {
      this.requireConfigured();
      if (!this.family) throw new Error('Enumerate the LP foldings first.');
      if (this.family.total > 10000n) throw new Error('Bulk export supports up to 10,000 paths; all paths remain available through pagination and individual export.');
      const paths = [];
      for (let i = 0n; i < this.family.total; i++) paths.push({index: String(i + 1n), ...describeLPPath(this.reference!, this.u, this.family.pathAt(i))});
      downloadJSON('lp-all-foldings-A2.json', {schema: 'lp-foldings-v1', mode: 'lp', schubertInput: [...this.u], totalPaths: String(this.family.total), paths});
    }));
    this.render();
  }
  get path(): LPPath {return this.walk?.path ?? initialPath();}
  get next() {return this.walk && !this.dirty ? this.walk.next : null;}
  get fitAlcoves(): Alcove[] {
    return [...(this.reference?.nodes ?? [A0]), ...this.path.nodes,
      ...(this.next ? [this.next.wall.adjacent] : []), ...(this.overlay ? this.page.flatMap(item => item.path.nodes) : [])];
  }
  activate(): void {
    this.active = true;
    this.attempt(() => {if (!this.walk) this.configure();});
    this.changed(true);
  }
  deactivate(): void {this.active = false; this.save();}
  private attempt(action: () => void): void {
    el('lp-error').textContent = '';
    try {action();} catch (error) {el('lp-error').textContent = (error as Error).message;}
  }
  private configure(): void {
    const weight = {a: integer('lp-a'), b: integer('lp-b')};
    const wordText = field('lp-reference-input').value.trim();
    const word = !wordText ? undefined : /^(e|1_W)$/i.test(wordText) ? [] : parseWord(wordText);
    const reference = lpReference(weight, word);
    const input = LP_INPUTS.find(item => item.id === select('lp-u').value);
    if (!input) throw new Error('Choose a Schubert input u in S₃.');
    const walk = new LPWalk(reference, input.permutation);
    const original = new LPWalk(reference, input.permutation);
    original.loadActions(reference.word.map(() => 'cross'));
    this.reference = reference; this.walk = walk; this.referencePath = original.path;
    this.u = [...input.permutation] as Permutation; this.customReference = !!wordText; this.active = true; this.dirty = false;
    this.family = null; this.page = []; this.pageStart = 0n; this.selectedIndex = null;
  }
  private requireConfigured(): void {
    if (!this.walk || !this.reference) throw new Error('Set the LP reference path first.');
    if (this.dirty) throw new Error('Inputs changed. Click “Set LP reference path” first.');
  }
  perform(kind: 'cross' | 'fold'): void {
    this.attempt(() => {this.requireConfigured(); this.walk!.step(kind); this.selectedIndex = null; this.changed(true);});
  }
  private loadPage(): void {
    this.page = [];
    if (!this.family) return;
    for (let index = this.pageStart; index < this.pageStart + PAGE_SIZE && index < this.family.total; index++) this.page.push({index, path: this.family.pathAt(index)});
  }
  private selectPath(index: bigint): void {
    this.requireConfigured();
    if (!this.family || index < 0n || index >= this.family.total) throw new Error(`Path number must be between 1 and ${this.family?.total ?? 1}.`);
    const path = this.family.pathAt(index);
    this.walk!.loadActions(path.steps.map(s => s.kind)); this.selectedIndex = index;
    const start = index / PAGE_SIZE * PAGE_SIZE;
    if (start !== this.pageStart) {this.pageStart = start; this.loadPage();}
    this.changed(true);
  }
  private changed(fit: boolean): void {this.render(); this.save(); this.onChange(fit);}
  private render(): void {
    el('lp-work').hidden = !this.walk;
    el('lp-family').hidden = !this.family;
    if (!this.walk || !this.reference) return;
    const ref = this.reference, {a, b} = ref.weight;
    el('lp-reference-summary').textContent = `λ = (${a})ω₁ + (${b})ω₂ · A₀ − λ = ${alcoveKey(ref.target)} · ${ref.word.length}-step reduced path`;
    el('lp-reference-roots').textContent = ref.reflections.map((r, i) => `${i + 1}: β = ${r.betaSign < 0 ? '−(' : ''}${rootLabel(r.root)}${r.betaSign < 0 ? ')' : ''}, r̄ = ${permutationKey(r.finite)}`).join(' · ') || 'Empty reference path';
    el('lp-current').textContent = `Geometric start A₀ · ${this.walk.complete ? 'Final alcove' : 'Current alcove'} ${alcoveKey(this.walk.current)}`;
    el('lp-progress').textContent = this.dirty ? 'Settings changed. Set the reference path to continue.' : `Completed ${this.walk.position} / ${ref.word.length} steps${this.selectedIndex === null ? '' : ` · Enumerated path #${this.selectedIndex + 1n}`}`;
    const next = this.next;
    el('lp-next-wall').textContent = next ? `Step ${this.walk.position + 1} · s${SUB[ref.word[this.walk.position]]} · ${next.wall.equation}` : '—';
    el('lp-reference-reflection').textContent = next ? `${next.referenceReflection.label} · Reference wall ${next.referenceReflection.wall.equation} · r̄ = ${permutationKey(next.referenceReflection.finite)}` : '—';
    el('lp-v').textContent = `v = ${permutationKey(this.walk.v)} (input u = ${permutationKey(this.u)})`;
    el('lp-candidate').textContent = next ? `v r̄${this.walk.position + 1} = ${permutationKey(next.candidate)}` : '—';
    el('lp-lengths').textContent = next ? `ℓ(v) = ${next.length} → ℓ(v r̄) = ${next.candidateLength}` : '—';
    el('lp-fold-reason').textContent = this.dirty ? 'Inputs changed. Set the reference path again.' : next ? next.reason : 'All reference positions have been processed.';
    el('lp-cross').textContent = next ? `Cross · c${SUB[ref.word[this.walk.position]]}${next.crossingSign > 0 ? '⁺' : '⁻'}` : 'Cross';
    el('lp-fold').textContent = next ? `Fold · f${SUB[ref.word[this.walk.position]]}${next.side > 0 ? '⁺' : '⁻'}${next.canFold ? '' : ' (not allowed)'}` : 'Fold';
    el('lp-cross').toggleAttribute('disabled', !next);
    el('lp-fold').toggleAttribute('disabled', !next?.canFold);
    el('lp-undo').toggleAttribute('disabled', this.dirty || !this.walk.position);
    el('lp-reset').toggleAttribute('disabled', this.dirty || !this.walk.position);
    el('lp-enumerate').toggleAttribute('disabled', this.dirty);
    el('lp-export-selected').toggleAttribute('disabled', this.dirty);
    el('lp-export-all').toggleAttribute('disabled', this.dirty || !this.family || this.family.total > 10000n);
    el('lp-complete-note').textContent = this.dirty ? 'The canvas still shows the previous reference path.' : this.walk.complete ? 'Walk complete. The final alcove is geometric; output w is the Schubert index.' : next?.canFold ? 'Cross changes the alcove; Fold changes the Bruhat element. Each consumes one reference position.' : 'Cross is required at this step; the Bruhat element stays unchanged.';
    el('lp-positions').textContent = `J = {${this.path.foldingPositions.join(', ')}}`;
    el('lp-chain').textContent = `Bruhat chain: ${this.path.bruhatChain.map(permutationKey).join(' ⋗ ')}`;
    el('lp-output-w').textContent = this.walk.complete ? `Output Schubert index w = ${permutationKey(this.path.outputW)}` : 'Output w: determined when all reference positions are complete';
    const data = describeLPPath(ref, this.u, this.path);
    if (this.walk.complete && data.term) el('lp-term').innerHTML = `K-theory term: ${termHTML(data.term, this.path.outputW)}`;
    else el('lp-term').textContent = 'K-theory term: incomplete walk prefix';
    if (!this.family) return;
    el('lp-total').textContent = this.family.total.toLocaleString();
    el('lp-page-info').textContent = `${this.pageStart + 1n}–${this.pageStart + BigInt(this.page.length)} / ${this.family.total} paths · Distinct J retained, even when alcoves or w coincide${this.family.total > 10000n ? ' · Bulk export limit: 10,000 paths' : ''}`;
    el('lp-prev').toggleAttribute('disabled', this.dirty || this.pageStart === 0n);
    el('lp-next').toggleAttribute('disabled', this.dirty || this.pageStart + PAGE_SIZE >= this.family.total);
    el('lp-list').innerHTML = this.page.map(({index, path}) => {
      const details = describeLPPath(ref, this.u, path);
      return `<button type="button" class="lp-card${index === this.selectedIndex ? ' selected' : ''}" data-lp-index="${index}" aria-pressed="${index === this.selectedIndex}"${this.dirty ? ' disabled' : ''}><span class="lp-card-title">#${index + 1n} · J = {${path.foldingPositions.join(', ')}}</span><span class="lp-actions">${actionLabel(path)}</span><span class="lp-endpoint">Final alcove ${alcoveKey(path.nodes[path.nodes.length - 1])}</span><span class="lp-card-output">Output w = ${permutationKey(path.outputW)} · ${path.bruhatChain.map(permutationKey).join(' ⋗ ')}</span><span class="lp-term">${details.term ? termHTML(details.term, path.outputW) : '—'}</span></button>`;
    }).join('');
    field('lp-jump').value = String((this.selectedIndex ?? this.pageStart) + 1n);
  }
  exportData(): object | null {
    if (!this.walk || !this.reference) return null;
    return {schema: 'lp-folding-v1', mode: 'lp', totalPaths: this.family?.total.toString() ?? null,
      ...describeLPPath(this.reference, this.u, this.path)};
  }
  private save(): void {
    if (!this.reference || !this.walk) return;
    try {localStorage.setItem(STORAGE, JSON.stringify({active: this.active, weight: this.reference.weight, word: this.reference.word,
      customReference: this.customReference, u: this.u, actions: this.path.steps.map(s => s.kind), enumerated: !!this.family,
      selectedIndex: this.selectedIndex?.toString() ?? null, pageStart: this.pageStart.toString(), overlay: this.overlay}));} catch { /* Optional persistence. */ }
  }
  restore(): void {
    try {
      const raw = localStorage.getItem(STORAGE); if (!raw) return;
      const data = JSON.parse(raw);
      const input = LP_INPUTS.find(item => item.id === permutationKey(data.u)); if (!input) return;
      const reference = lpReference(data.weight, data.word);
      const walk = new LPWalk(reference, input.permutation); walk.loadActions(data.actions);
      const original = new LPWalk(reference, input.permutation); original.loadActions(reference.word.map(() => 'cross'));
      this.walk = walk; this.reference = reference; this.referencePath = original.path; this.u = [...input.permutation] as Permutation;
      this.active = data.active === true; this.overlay = data.overlay !== false;
      if (data.enumerated) {
        this.family = new LPFamily(reference, this.u);
        const startIndex = BigInt(data.pageStart ?? '0');
        this.pageStart = startIndex >= 0n && startIndex < this.family.total ? startIndex / PAGE_SIZE * PAGE_SIZE : 0n;
        const index = data.selectedIndex == null ? null : BigInt(data.selectedIndex);
        this.selectedIndex = index !== null && index >= 0n && index < this.family.total ? index : null;
        if (this.selectedIndex !== null) {
          const selected = this.family.pathAt(this.selectedIndex);
          if (selected.steps.map(s => s.kind).join() !== walk.path.steps.map(s => s.kind).join()) this.selectedIndex = null;
        }
        this.loadPage();
      }
      field('lp-a').value = String(reference.weight.a); field('lp-b').value = String(reference.weight.b);
      select('lp-u').value = input.id;
      this.customReference = data.customReference === true;
      field('lp-reference-input').value = this.customReference ? (reference.word.join(' ') || 'e') : '';
      field('lp-overlay').checked = this.overlay; this.render();
    } catch {this.active = false; this.walk = null; this.reference = null; this.referencePath = null; this.family = null; this.page = []; this.render();}
  }
}
