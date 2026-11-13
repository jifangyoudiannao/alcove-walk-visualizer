import { A0, alcoveKey, formatWord, parseWord } from '../math/affineA2.js';
import { FINITE_STARTS, RamFamily, RamWalk, describeRamPath, ramReference } from '../math/ram.js';
import { actionLabel } from './foldExplorer.js';
const PAGE_SIZE = 6n;
const STORAGE = 'alcove-ram-explorer:v1';
const SUB = ['₀', '₁', '₂'];
const el = (id) => document.getElementById(id);
const field = (id) => el(id);
const select = (id) => el(id);
const signText = (sign) => sign > 0 ? '+' : '−';
const initialPath = () => ({ nodes: [{ ...A0 }], steps: [], folds: 0, positiveFolds: 0, negativeFolds: 0 });
function integer(id) {
    const text = field(id).value.trim();
    if (!/^[+-]?\d+$/.test(text) || !Number.isSafeInteger(Number(text)))
        throw new Error('a and b must be safe integers.');
    return Number(text);
}
function downloadJSON(name, value) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export class RamExplorer {
    onChange;
    active = false;
    walk = null;
    reference = null;
    referencePath = null;
    family = null;
    startId = 'e';
    positiveOnly = false;
    customReference = false;
    overlay = true;
    dirty = false;
    selectedIndex = null;
    pageStart = 0n;
    page = [];
    constructor(onChange) {
        this.onChange = onChange;
        el('ram-form').addEventListener('submit', event => { event.preventDefault(); this.attempt(() => { this.configure(); this.changed(true); }); });
        for (const id of ['ram-a', 'ram-b', 'ram-start', 'ram-mode', 'ram-reference-input']) {
            el(id).addEventListener('input', () => { this.dirty = true; this.render(); this.onChange(false); });
        }
        el('ram-demo').addEventListener('click', () => this.attempt(() => {
            field('ram-a').value = '1';
            field('ram-b').value = '1';
            select('ram-start').value = '121';
            select('ram-mode').value = 'positive';
            field('ram-reference-input').value = '';
            this.configure();
            this.changed(true);
        }));
        el('ram-cross').addEventListener('click', () => this.perform('cross'));
        el('ram-fold').addEventListener('click', () => this.perform('fold'));
        el('ram-undo').addEventListener('click', () => this.attempt(() => {
            this.requireConfigured();
            this.walk.undo();
            this.selectedIndex = null;
            this.changed(false);
        }));
        el('ram-reset').addEventListener('click', () => this.attempt(() => {
            this.requireConfigured();
            this.walk.reset();
            this.selectedIndex = null;
            this.changed(true);
        }));
        el('ram-enumerate').addEventListener('click', () => this.attempt(() => {
            this.requireConfigured();
            this.family = new RamFamily(this.reference, this.walk.start, this.positiveOnly);
            this.pageStart = 0n;
            this.selectedIndex = null;
            this.loadPage();
            this.changed(true);
        }));
        el('ram-list').addEventListener('click', event => {
            const card = event.target.closest('[data-ram-index]');
            if (card)
                this.attempt(() => this.selectPath(BigInt(card.dataset.ramIndex)));
        });
        el('ram-prev').addEventListener('click', () => this.attempt(() => this.selectPath(this.pageStart - PAGE_SIZE)));
        el('ram-next').addEventListener('click', () => this.attempt(() => this.selectPath(this.pageStart + PAGE_SIZE)));
        el('ram-jump-form').addEventListener('submit', event => {
            event.preventDefault();
            this.attempt(() => {
                const text = field('ram-jump').value.trim();
                if (!/^\d+$/.test(text))
                    throw new Error('Enter a path number starting at 1.');
                this.selectPath(BigInt(text) - 1n);
            });
        });
        el('ram-overlay').addEventListener('change', () => { this.overlay = field('ram-overlay').checked; this.changed(true); });
        el('ram-export-selected').addEventListener('click', () => this.attempt(() => {
            this.requireConfigured();
            downloadJSON('ram-walk-A2.json', this.exportData());
        }));
        el('ram-export-all').addEventListener('click', () => this.attempt(() => {
            this.requireConfigured();
            if (!this.family)
                throw new Error('Enumerate the Ram walks first.');
            if (this.family.total > 10000n)
                throw new Error('Bulk export supports up to 10,000 paths; all paths remain available through pagination and individual export.');
            const paths = [];
            for (let i = 0n; i < this.family.total; i++)
                paths.push({ index: String(i + 1n), ...describeRamPath(this.reference, this.walk.start, this.family.pathAt(i)) });
            downloadJSON('ram-all-walks-A2.json', { schema: 'ram-walks-v1', mode: this.positiveOnly ? 'positive' : 'ram', initialW: this.startId, totalPaths: String(this.family.total), paths });
        }));
        this.render();
    }
    get path() { return this.walk?.path ?? initialPath(); }
    get next() { return this.walk && !this.dirty ? this.walk.next : null; }
    get fitAlcoves() {
        return [...(this.reference?.nodes ?? [A0]), ...this.path.nodes,
            ...(this.next ? [this.next.wall.adjacent] : []), ...(this.overlay ? this.page.flatMap(item => item.path.nodes) : [])];
    }
    activate() {
        this.active = true;
        this.attempt(() => { if (!this.walk)
            this.configure(); });
        this.changed(true);
    }
    deactivate() { this.active = false; this.save(); }
    attempt(action) {
        el('ram-error').textContent = '';
        try {
            action();
        }
        catch (error) {
            el('ram-error').textContent = error.message;
        }
    }
    configure() {
        const weight = { a: integer('ram-a'), b: integer('ram-b') };
        const wordText = field('ram-reference-input').value.trim();
        const word = !wordText ? undefined : /^(e|1_W)$/i.test(wordText) ? [] : parseWord(wordText);
        const reference = ramReference(weight, word);
        const startId = select('ram-start').value;
        const start = FINITE_STARTS.find(item => item.id === startId);
        if (!start)
            throw new Error('Choose a starting alcove from the finite Weyl group.');
        const positiveOnly = select('ram-mode').value === 'positive';
        const walk = new RamWalk(reference, start.alcove, positiveOnly);
        const original = new RamWalk(reference);
        original.loadActions(reference.word.map(() => 'cross'));
        this.reference = reference;
        this.walk = walk;
        this.referencePath = original.path;
        this.startId = startId;
        this.positiveOnly = positiveOnly;
        this.customReference = !!wordText;
        this.active = true;
        this.dirty = false;
        this.family = null;
        this.page = [];
        this.pageStart = 0n;
        this.selectedIndex = null;
    }
    requireConfigured() {
        if (!this.walk || !this.reference)
            throw new Error('Set the reference path first.');
        if (this.dirty)
            throw new Error('Inputs changed. Click “Set reference path” first.');
    }
    perform(kind) {
        this.attempt(() => { this.requireConfigured(); this.walk.step(kind); this.selectedIndex = null; this.changed(true); });
    }
    loadPage() {
        this.page = [];
        if (!this.family)
            return;
        for (let index = this.pageStart; index < this.pageStart + PAGE_SIZE && index < this.family.total; index++)
            this.page.push({ index, path: this.family.pathAt(index) });
    }
    selectPath(index) {
        this.requireConfigured();
        if (!this.family || index < 0n || index >= this.family.total)
            throw new Error(`Path number must be between 1 and ${this.family?.total ?? 1}.`);
        const path = this.family.pathAt(index);
        this.walk.loadActions(path.steps.map(s => s.kind));
        this.selectedIndex = index;
        const start = index / PAGE_SIZE * PAGE_SIZE;
        if (start !== this.pageStart) {
            this.pageStart = start;
            this.loadPage();
        }
        this.changed(true);
    }
    changed(fit) { this.render(); this.save(); this.onChange(fit); }
    render() {
        el('ram-work').hidden = !this.walk;
        el('ram-family').hidden = !this.family;
        if (!this.walk || !this.reference)
            return;
        const { a, b } = this.reference.weight;
        const ref = this.reference;
        el('ram-reference-summary').textContent = `λ = (${a})ω₁ + (${b})ω₂ · A₀ + λ = ${alcoveKey(ref.target)} · ${ref.word.length}-step reduced path`;
        el('ram-reference-signs').textContent = ref.word.map((type, i) => `c${SUB[type]}${ref.signs[i] > 0 ? '⁺' : '⁻'}`).join(' ') || 'e';
        el('ram-current').textContent = `w = ${formatWord(FINITE_STARTS.find(s => s.id === this.startId).word)} · Start ${alcoveKey(this.walk.start)} · Current ${alcoveKey(this.walk.current)}`;
        el('ram-progress').textContent = this.dirty ? 'Settings changed. Set the reference path to continue.' : `Completed ${this.walk.position} / ${ref.word.length} steps${this.selectedIndex === null ? '' : ` · Enumerated path #${this.selectedIndex + 1n}`}`;
        const next = this.next;
        el('ram-next-wall').textContent = next ? `Step ${this.walk.position + 1} · s${SUB[ref.word[this.walk.position]]} · ${next.wall.equation}` : '—';
        el('ram-side').textContent = next ? `${next.side > 0 ? 'Positive side' : 'Negative side'}` : '—';
        el('ram-reference-sign').textContent = next ? `ε${this.walk.position + 1} = ${signText(next.referenceSign)}` : '—';
        el('ram-choice-panel').classList.toggle('has-choice', !!next?.canFold);
        el('ram-choice-panel').setAttribute('aria-label', next?.canFold ? 'Choose Crossing or Folding' : 'Only Crossing is allowed at this step');
        el('ram-cross').textContent = next ? `Crossing · c${SUB[ref.word[this.walk.position]]}${next.crossingSign > 0 ? '⁺' : '⁻'}` : 'Crossing';
        el('ram-fold').textContent = next ? `Folding · f${SUB[ref.word[this.walk.position]]}${next.side > 0 ? '⁺' : '⁻'}${next.canFold ? '' : ' (not allowed)'}` : 'Folding';
        el('ram-cross').toggleAttribute('disabled', !next);
        el('ram-fold').toggleAttribute('disabled', !next?.canFold);
        el('ram-undo').toggleAttribute('disabled', this.dirty || !this.walk.position);
        el('ram-reset').toggleAttribute('disabled', this.dirty || !this.walk.position);
        el('ram-enumerate').toggleAttribute('disabled', this.dirty);
        el('ram-export-selected').toggleAttribute('disabled', this.dirty);
        el('ram-export-all').toggleAttribute('disabled', this.dirty || !this.family || this.family.total > 10000n);
        el('ram-complete-note').textContent = this.dirty ? 'The canvas still shows the previous reference path.' : this.walk.complete ? 'Walk complete. Enumerate all results or undo a step to change your choices.' : next?.canFold ? 'Two operations are allowed: choose crossing or folding.' : 'Only crossing is allowed at this step; folding is disabled.';
        const data = describeRamPath(ref, this.walk.start, this.path);
        el('ram-positions').textContent = `J = {${data.foldingPositions.join(', ')}}`;
        el('ram-fold-stats').textContent = `Positive folds ${this.path.positiveFolds} · Negative folds ${this.path.negativeFolds} · Total ${this.path.folds}`;
        el('ram-coefficient').textContent = `${this.walk.complete ? 'Path coefficient' : 'Prefix coefficient'}: ${data.coefficient.expression}`;
        if (!this.family)
            return;
        el('ram-total').textContent = this.family.total.toLocaleString();
        el('ram-page-info').textContent = `${this.pageStart + 1n}–${this.pageStart + BigInt(this.page.length)} / ${this.family.total} paths · Distinct walks retained, even with equal endpoints${this.family.total > 10000n ? ' · Bulk export limit: 10,000 paths' : ''}`;
        el('ram-prev').toggleAttribute('disabled', this.dirty || this.pageStart === 0n);
        el('ram-next').toggleAttribute('disabled', this.dirty || this.pageStart + PAGE_SIZE >= this.family.total);
        el('ram-list').innerHTML = this.page.map(({ index, path }) => {
            const details = describeRamPath(ref, this.walk.start, path);
            return `<button type="button" class="ram-card${index === this.selectedIndex ? ' selected' : ''}" data-ram-index="${index}" aria-pressed="${index === this.selectedIndex}"${this.dirty ? ' disabled' : ''}><span class="ram-card-title">#${index + 1n} · J = {${details.foldingPositions.join(', ')}}</span><span class="ram-actions">${actionLabel(path)}</span><span class="ram-endpoint">Endpoint ${alcoveKey(path.nodes[path.nodes.length - 1])}</span><span class="ram-coefficient">Coefficient ${details.coefficient.expression}</span></button>`;
        }).join('');
        field('ram-jump').value = String((this.selectedIndex ?? this.pageStart) + 1n);
    }
    exportData() {
        if (!this.walk || !this.reference)
            return null;
        return { schema: 'ram-walk-v1', mode: this.positiveOnly ? 'positive' : 'ram', initialW: this.startId, totalPaths: this.family?.total.toString() ?? null,
            ...describeRamPath(this.reference, this.walk.start, this.path) };
    }
    save() {
        if (!this.reference || !this.walk)
            return;
        try {
            localStorage.setItem(STORAGE, JSON.stringify({ active: this.active, weight: this.reference.weight, word: this.reference.word, customReference: this.customReference, startId: this.startId,
                positiveOnly: this.positiveOnly, actions: this.path.steps.map(s => s.kind), enumerated: !!this.family, selectedIndex: this.selectedIndex?.toString() ?? null,
                pageStart: this.pageStart.toString(), overlay: this.overlay }));
        }
        catch { /* Optional persistence. */ }
    }
    restore() {
        try {
            const raw = localStorage.getItem(STORAGE);
            if (!raw)
                return;
            const data = JSON.parse(raw);
            const start = FINITE_STARTS.find(s => s.id === data.startId);
            if (!start)
                return;
            const reference = ramReference(data.weight, data.word);
            const walk = new RamWalk(reference, start.alcove, data.positiveOnly === true);
            walk.loadActions(data.actions);
            const original = new RamWalk(reference);
            original.loadActions(reference.word.map(() => 'cross'));
            this.walk = walk;
            this.reference = reference;
            this.referencePath = original.path;
            this.startId = start.id;
            this.positiveOnly = data.positiveOnly === true;
            this.active = data.active === true;
            this.overlay = data.overlay !== false;
            if (data.enumerated) {
                this.family = new RamFamily(reference, start.alcove, this.positiveOnly);
                const startIndex = BigInt(data.pageStart ?? '0');
                this.pageStart = startIndex >= 0n && startIndex < this.family.total ? startIndex / PAGE_SIZE * PAGE_SIZE : 0n;
                const index = data.selectedIndex === null ? null : BigInt(data.selectedIndex);
                this.selectedIndex = index !== null && index >= 0n && index < this.family.total ? index : null;
                this.loadPage();
            }
            field('ram-a').value = String(reference.weight.a);
            field('ram-b').value = String(reference.weight.b);
            select('ram-start').value = start.id;
            select('ram-mode').value = this.positiveOnly ? 'positive' : 'ram';
            this.customReference = data.customReference !== false;
            field('ram-reference-input').value = this.customReference ? (reference.word.join(' ') || 'e') : '';
            field('ram-overlay').checked = this.overlay;
            this.render();
        }
        catch {
            this.active = false;
            this.walk = null;
            this.family = null;
            this.page = [];
            this.render();
        }
    }
}
