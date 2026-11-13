import { alcoveKey, formatWord, type Alcove } from '../math/affineA2.js';
import { FoldFamily, reducedGallery, type FoldPath, type FoldRule, type ReducedGallery } from '../math/folded.js';

const PAGE_SIZE = 8n;
const STORAGE = 'alcove-weight-explorer:v1';
const SUB = ['₀', '₁', '₂'];
function el(id: string): HTMLElement { return document.getElementById(id)!; }
function input(id: string): HTMLInputElement { return el(id) as HTMLInputElement; }
function ruleValue(): FoldRule { return (el('fold-rule') as HTMLSelectElement).value as FoldRule; }
function integerValue(id: string): number {
  const value = input(id).value.trim();
  if (!/^[+-]?\d+$/.test(value)) throw new Error('Enter integer weight coefficients a and b (negative values and zero are allowed).');
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Weight coefficient exceeds the safe integer range.');
  return number;
}
export function actionLabel(path: FoldPath): string {
  return path.steps.map(s => `${s.kind === 'fold' ? 'f' : 'c'}${SUB[s.type]}${s.sign > 0 ? '⁺' : '⁻'}`).join(' ') || 'e';
}

/** Keeps the computed family separate from the user's editable freehand walk. */
export class FoldExplorer {
  active = false;
  gallery: ReducedGallery | null = null;
  family: FoldFamily | null = null;
  rule: FoldRule = 'all';
  selectedIndex: bigint | null = null;
  pageStart = 0n;
  overlay = true;
  path: FoldPath | null = null;
  reference: FoldPath | null = null;
  page: { index: bigint; path: FoldPath }[] = [];
  constructor(private onChange: (fit: boolean) => void) {
    el('weight-form').addEventListener('submit', event => {
      event.preventDefault();
      this.attempt(() => {
        const gallery = reducedGallery({ a: integerValue('weight-a'), b: integerValue('weight-b') });
        this.generate(gallery, ruleValue());
        this.changed(true);
      });
    });
    el('fold-rule').addEventListener('change', () => this.attempt(() => {
      this.rule = ruleValue();
      if (this.gallery) this.generate(this.gallery, this.rule);
      this.render();
      this.changed(true);
    }));
    el('show-reference').addEventListener('click', () => {
      if (!this.reference) return;
      this.active = true; this.selectedIndex = null; this.path = this.reference;
      this.render(); this.changed(true);
    });
    el('show-family-overlay').addEventListener('change', () => {
      this.overlay = input('show-family-overlay').checked;
      this.changed(true);
    });
    el('family-list').addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLElement>('[data-path-index]');
      if (button) this.attempt(() => this.select(BigInt(button.dataset.pathIndex!)));
    });
    el('family-prev').addEventListener('click', () => this.attempt(() => this.select(this.pageStart - PAGE_SIZE)));
    el('family-next').addEventListener('click', () => this.attempt(() => this.select(this.pageStart + PAGE_SIZE)));
    el('family-jump-form').addEventListener('submit', event => {
      event.preventDefault();
      this.attempt(() => {
        const text = input('family-jump').value.trim();
        if (!/^\d+$/.test(text)) throw new Error('Enter a path number starting at 1.');
        this.select(BigInt(text) - 1n);
      });
    });
    el('leave-family').addEventListener('click', () => { this.deactivate(); this.onChange(true); });
    this.render();
  }
  private attempt(action: () => void): void {
    el('weight-error').textContent = '';
    try { action(); } catch (error) { el('weight-error').textContent = (error as Error).message; }
  }
  private generate(gallery: ReducedGallery, rule: FoldRule): void {
    const family = new FoldFamily(gallery, rule);
    this.gallery = gallery; this.family = family; this.rule = rule;
    this.reference = new FoldFamily(gallery, 'all').pathAt(0n);
    this.path = this.reference; this.active = true; this.selectedIndex = null; this.pageStart = 0n;
    this.loadPage(); this.render();
  }
  private loadPage(): void {
    this.page = [];
    if (!this.family) return;
    for (let index = this.pageStart; index < this.pageStart + PAGE_SIZE && index < this.family.total; index++) {
      this.page.push({ index, path: this.family.pathAt(index) });
    }
  }
  select(index: bigint): void {
    if (!this.family || index < 0n || index >= this.family.total) throw new Error(`Path number must be between 1 and ${this.family?.total ?? 1}.`);
    this.path = this.family.pathAt(index); this.selectedIndex = index; this.active = true;
    const start = index / PAGE_SIZE * PAGE_SIZE;
    if (start !== this.pageStart) { this.pageStart = start; this.loadPage(); }
    this.render(); this.changed(true);
  }
  deactivate(): void { this.active = false; this.render(); this.save(); }
  private changed(fit: boolean): void { this.save(); this.onChange(fit); }
  get fitAlcoves(): Alcove[] {
    if (!this.active || !this.path || !this.gallery) return [];
    return [...this.gallery.nodes, ...this.path.nodes, ...(this.overlay ? this.page.flatMap(p => p.path.nodes) : [])];
  }
  private render(): void {
    const notes: Record<FoldRule, string> = {
      all: 'Cross or fold at every step. Wall types are fixed; after a fold, continue from the current alcove. This includes all geometric foldings, without the LP Bruhat condition.',
      positive: 'Fold only on the positive side: x > n, y > n, or x + y > n. Crossings may have either sign.',
      ram: 'Ram §3.2, Theorem 3.3: the fold sign must match the reference crossing sign. This explorer starts at A₀ (w = e), so only the original unfolded path remains.',
    };
    el('fold-rule-note').textContent = notes[this.rule];
    el('fold-results').hidden = !this.family;
    if (!this.gallery || !this.family) return;
    const { a, b } = this.gallery.weight;
    el('weight-target').textContent = `λ = (${a})ω₁ + (${b})ω₂ · Target A₀ − λ = ${alcoveKey(this.gallery.target)}`;
    el('reference-word').textContent = `Reduced path · ${this.gallery.word.length} steps · ${formatWord(this.gallery.word)}`;
    el('family-count').textContent = this.family.total.toLocaleString();
    el('family-page-info').textContent = `Paths ${this.pageStart + 1n}–${this.pageStart + BigInt(this.page.length)} / ${this.family.total} · ${this.active ? this.selectedIndex === null ? 'Reference path' : `Selected #${this.selectedIndex + 1n}` : 'Free drawing'}`;
    el('family-prev').toggleAttribute('disabled', this.pageStart === 0n);
    el('family-next').toggleAttribute('disabled', this.pageStart + PAGE_SIZE >= this.family.total);
    el('show-reference').setAttribute('aria-pressed', String(this.active && this.selectedIndex === null));
    el('family-list').innerHTML = this.page.map(({ index, path }) => {
      const selected = this.active && this.selectedIndex === index;
      return `<button type="button" class="family-card${selected ? ' selected' : ''}" data-path-index="${index}" aria-pressed="${selected}"><span class="family-card-top"><strong>#${index + 1n}</strong><span>${path.folds} folds · +${path.positiveFolds} / −${path.negativeFolds}</span></span><span class="family-actions">${actionLabel(path)}</span><span class="family-endpoint">Endpoint ${alcoveKey(path.nodes[path.nodes.length - 1])}</span></button>`;
    }).join('');
    input('family-jump').value = String((this.selectedIndex ?? this.pageStart) + 1n);
  }
  save(): void {
    if (!this.gallery) return;
    try { localStorage.setItem(STORAGE, JSON.stringify({ weight: this.gallery.weight, rule: this.rule, active: this.active, overlay: this.overlay, index: this.selectedIndex?.toString() ?? null, pageStart: this.pageStart.toString() })); } catch { /* Storage is optional. */ }
  }
  restore(): void {
    try {
      const raw = localStorage.getItem(STORAGE); if (!raw) return;
      const data = JSON.parse(raw);
      if (!['all', 'positive', 'ram'].includes(data.rule)) return;
      this.generate(reducedGallery(data.weight), data.rule);
      if (data.index !== null) {
        const index = BigInt(data.index);
        this.path = this.family!.pathAt(index); this.selectedIndex = index;
      }
      const start = BigInt(data.pageStart ?? '0');
      if (start >= 0n && start < this.family!.total) { this.pageStart = start / PAGE_SIZE * PAGE_SIZE; this.loadPage(); }
      this.active = data.active === true; this.overlay = data.overlay !== false;
      input('weight-a').value = String(this.gallery!.weight.a); input('weight-b').value = String(this.gallery!.weight.b);
      (el('fold-rule') as HTMLSelectElement).value = this.rule;
      input('show-family-overlay').checked = this.overlay;
      this.render();
    } catch { this.active = false; }
  }
  exportData(): object | null {
    if (!this.active || !this.gallery || !this.path || !this.family) return null;
    return { rootSystem: 'A2_affine', weightBasis: 'fundamental weights', rule: this.rule, weight: this.gallery.weight, target: this.gallery.target, reference: this.gallery, totalPaths: this.family.total.toString(), selectedPath: this.selectedIndex === null ? 'reference' : (this.selectedIndex + 1n).toString(), path: this.path };
  }
}
