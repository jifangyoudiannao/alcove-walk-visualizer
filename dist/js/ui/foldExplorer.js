import { alcoveKey, formatWord } from '../math/affineA2.js';
import { FoldFamily, reducedGallery } from '../math/folded.js';
const PAGE_SIZE = 8n;
const STORAGE = 'alcove-weight-explorer:v1';
const SUB = ['₀', '₁', '₂'];
function el(id) { return document.getElementById(id); }
function input(id) { return el(id); }
function ruleValue() { return el('fold-rule').value; }
function integerValue(id) {
    const value = input(id).value.trim();
    if (!/^[+-]?\d+$/.test(value))
        throw new Error('请输入整数 weight 系数 a、b（可为负数或 0）。');
    const number = Number(value);
    if (!Number.isSafeInteger(number))
        throw new Error('weight 系数超出安全整数范围。');
    return number;
}
export function actionLabel(path) {
    return path.steps.map(s => `${s.kind === 'fold' ? 'f' : 'c'}${SUB[s.type]}${s.sign > 0 ? '⁺' : '⁻'}`).join(' ') || 'e';
}
/** Keeps the computed family separate from the user's editable freehand walk. */
export class FoldExplorer {
    onChange;
    active = false;
    gallery = null;
    family = null;
    rule = 'all';
    selectedIndex = null;
    pageStart = 0n;
    overlay = true;
    path = null;
    reference = null;
    page = [];
    constructor(onChange) {
        this.onChange = onChange;
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
            if (this.gallery)
                this.generate(this.gallery, this.rule);
            this.render();
            this.changed(true);
        }));
        el('show-reference').addEventListener('click', () => {
            if (!this.reference)
                return;
            this.active = true;
            this.selectedIndex = null;
            this.path = this.reference;
            this.render();
            this.changed(true);
        });
        el('show-family-overlay').addEventListener('change', () => {
            this.overlay = input('show-family-overlay').checked;
            this.changed(true);
        });
        el('family-list').addEventListener('click', event => {
            const button = event.target.closest('[data-path-index]');
            if (button)
                this.attempt(() => this.select(BigInt(button.dataset.pathIndex)));
        });
        el('family-prev').addEventListener('click', () => this.attempt(() => this.select(this.pageStart - PAGE_SIZE)));
        el('family-next').addEventListener('click', () => this.attempt(() => this.select(this.pageStart + PAGE_SIZE)));
        el('family-jump-form').addEventListener('submit', event => {
            event.preventDefault();
            this.attempt(() => {
                const text = input('family-jump').value.trim();
                if (!/^\d+$/.test(text))
                    throw new Error('请输入从 1 开始的路径编号。');
                this.select(BigInt(text) - 1n);
            });
        });
        el('leave-family').addEventListener('click', () => { this.deactivate(); this.onChange(true); });
        this.render();
    }
    attempt(action) {
        el('weight-error').textContent = '';
        try {
            action();
        }
        catch (error) {
            el('weight-error').textContent = error.message;
        }
    }
    generate(gallery, rule) {
        const family = new FoldFamily(gallery, rule);
        this.gallery = gallery;
        this.family = family;
        this.rule = rule;
        this.reference = new FoldFamily(gallery, 'all').pathAt(0n);
        this.path = this.reference;
        this.active = true;
        this.selectedIndex = null;
        this.pageStart = 0n;
        this.loadPage();
        this.render();
    }
    loadPage() {
        this.page = [];
        if (!this.family)
            return;
        for (let index = this.pageStart; index < this.pageStart + PAGE_SIZE && index < this.family.total; index++) {
            this.page.push({ index, path: this.family.pathAt(index) });
        }
    }
    select(index) {
        if (!this.family || index < 0n || index >= this.family.total)
            throw new Error(`路径编号须介于 1 和 ${this.family?.total ?? 1} 之间。`);
        this.path = this.family.pathAt(index);
        this.selectedIndex = index;
        this.active = true;
        const start = index / PAGE_SIZE * PAGE_SIZE;
        if (start !== this.pageStart) {
            this.pageStart = start;
            this.loadPage();
        }
        this.render();
        this.changed(true);
    }
    deactivate() { this.active = false; this.render(); this.save(); }
    changed(fit) { this.save(); this.onChange(fit); }
    get fitAlcoves() {
        if (!this.active || !this.path || !this.gallery)
            return [];
        return [...this.gallery.nodes, ...this.path.nodes, ...(this.overlay ? this.page.flatMap(p => p.path.nodes) : [])];
    }
    render() {
        const notes = {
            all: '每一步可穿墙或在该墙折返；固定墙类型序列，折叠后从当前 alcove 继续。这是全部几何折叠路径，不附加 LP 的 Bruhat 条件。',
            positive: '仅在墙的正侧允许折叠：x > n、y > n 或 x + y > n。穿墙仍可沿任一方向。',
            ram: '按 Ram §3.2 Theorem 3.3：fold 的符号须等于参考 crossing 的符号。这里起点为 A₀（w = e），因此只有原来的无折叠路径。',
        };
        el('fold-rule-note').textContent = notes[this.rule];
        el('fold-results').hidden = !this.family;
        if (!this.gallery || !this.family)
            return;
        const { a, b } = this.gallery.weight;
        el('weight-target').textContent = `λ = (${a})ω₁ + (${b})ω₂ · 目标 A₀ − λ = ${alcoveKey(this.gallery.target)}`;
        el('reference-word').textContent = `Reduced path · ${this.gallery.word.length} 步 · ${formatWord(this.gallery.word)}`;
        el('family-count').textContent = this.family.total.toLocaleString();
        el('family-page-info').textContent = `路径 ${this.pageStart + 1n}–${this.pageStart + BigInt(this.page.length)} / ${this.family.total} · ${this.active ? this.selectedIndex === null ? '查看参考路径' : `选中 #${this.selectedIndex + 1n}` : '自由绘制中'}`;
        el('family-prev').toggleAttribute('disabled', this.pageStart === 0n);
        el('family-next').toggleAttribute('disabled', this.pageStart + PAGE_SIZE >= this.family.total);
        el('show-reference').setAttribute('aria-pressed', String(this.active && this.selectedIndex === null));
        el('family-list').innerHTML = this.page.map(({ index, path }) => {
            const selected = this.active && this.selectedIndex === index;
            return `<button type="button" class="family-card${selected ? ' selected' : ''}" data-path-index="${index}" aria-pressed="${selected}"><span class="family-card-top"><strong>#${index + 1n}</strong><span>${path.folds} 次折叠 · +${path.positiveFolds} / −${path.negativeFolds}</span></span><span class="family-actions">${actionLabel(path)}</span><span class="family-endpoint">终点 ${alcoveKey(path.nodes[path.nodes.length - 1])}</span></button>`;
        }).join('');
        input('family-jump').value = String((this.selectedIndex ?? this.pageStart) + 1n);
    }
    save() {
        if (!this.gallery)
            return;
        try {
            localStorage.setItem(STORAGE, JSON.stringify({ weight: this.gallery.weight, rule: this.rule, active: this.active, overlay: this.overlay, index: this.selectedIndex?.toString() ?? null, pageStart: this.pageStart.toString() }));
        }
        catch { /* Storage is optional. */ }
    }
    restore() {
        try {
            const raw = localStorage.getItem(STORAGE);
            if (!raw)
                return;
            const data = JSON.parse(raw);
            if (!['all', 'positive', 'ram'].includes(data.rule))
                return;
            this.generate(reducedGallery(data.weight), data.rule);
            if (data.index !== null) {
                const index = BigInt(data.index);
                this.path = this.family.pathAt(index);
                this.selectedIndex = index;
            }
            const start = BigInt(data.pageStart ?? '0');
            if (start >= 0n && start < this.family.total) {
                this.pageStart = start / PAGE_SIZE * PAGE_SIZE;
                this.loadPage();
            }
            this.active = data.active === true;
            this.overlay = data.overlay !== false;
            input('weight-a').value = String(this.gallery.weight.a);
            input('weight-b').value = String(this.gallery.weight.b);
            el('fold-rule').value = this.rule;
            input('show-family-overlay').checked = this.overlay;
            this.render();
        }
        catch {
            this.active = false;
        }
    }
    exportData() {
        if (!this.active || !this.gallery || !this.path || !this.family)
            return null;
        return { rootSystem: 'A2_affine', weightBasis: 'fundamental weights', rule: this.rule, weight: this.gallery.weight, target: this.gallery.target, reference: this.gallery, totalPaths: this.family.total.toString(), selectedPath: this.selectedIndex === null ? 'reference' : (this.selectedIndex + 1n).toString(), path: this.path };
    }
}
