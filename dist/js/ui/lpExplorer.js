import { A0, alcoveKey, parseWord } from '../math/affineA2.js';
import { LP_INPUTS, LPFamily, LPWalk, describeLPPath, lpReference, permutationKey, } from '../math/lp.js';
import { actionLabel } from './foldExplorer.js';
const PAGE_SIZE = 6n;
const STORAGE = 'alcove-lp-explorer:v1';
const SUB = ['₀', '₁', '₂'];
const el = (id) => document.getElementById(id);
const field = (id) => el(id);
const select = (id) => el(id);
const rootLabel = (root) => root === 'alpha1' ? 'α₁' : root === 'alpha2' ? 'α₂' : 'α₁ + α₂';
function termHTML(term, w) {
    const parts = [];
    for (const [coefficient, basis] of [[term.mu.a, 'ω₁'], [term.mu.b, 'ω₂']]) {
        if (!Number.isSafeInteger(coefficient))
            throw new Error('K-theory 权重必须是精确整数');
        if (!coefficient)
            continue;
        const magnitude = Math.abs(coefficient);
        const body = `${magnitude === 1 ? '' : magnitude}${basis}`;
        parts.push(`${parts.length ? (coefficient < 0 ? ' − ' : ' + ') : (coefficient < 0 ? '−' : '')}${body}`);
    }
    // Only validated integers, fixed symbols and a validated S3 permutation
    // enter this HTML; JSON retains the engine's plain-text expression.
    return `${term.sign < 0 ? '−' : ''}x<sup>${parts.join('') || '0'}</sup> [O<sub>${permutationKey(w)}</sub>]`;
}
const initialPath = () => ({
    nodes: [{ ...A0 }], steps: [], folds: 0, positiveFolds: 0, negativeFolds: 0,
    bruhatChain: [[3, 2, 1]], outputW: [3, 2, 1], foldingPositions: [],
});
function integer(id) {
    const text = field(id).value.trim();
    if (!/^[+-]?\d+$/.test(text) || !Number.isSafeInteger(Number(text)))
        throw new Error('a、b 必须是安全范围内的整数。');
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
/** Independent UI state for LP u-admissibility; geometry always starts at A0. */
export class LPExplorer {
    onChange;
    active = false;
    walk = null;
    reference = null;
    referencePath = null;
    family = null;
    u = [3, 2, 1];
    customReference = false;
    overlay = true;
    dirty = false;
    selectedIndex = null;
    pageStart = 0n;
    page = [];
    constructor(onChange) {
        this.onChange = onChange;
        el('lp-form').addEventListener('submit', event => { event.preventDefault(); this.attempt(() => { this.configure(); this.changed(true); }); });
        for (const id of ['lp-a', 'lp-b', 'lp-u', 'lp-reference-input']) {
            el(id).addEventListener('input', () => { this.dirty = true; this.render(); this.onChange(false); });
        }
        el('lp-demo').addEventListener('click', () => this.attempt(() => {
            field('lp-a').value = '1';
            field('lp-b').value = '0';
            select('lp-u').value = '321';
            field('lp-reference-input').value = '';
            this.configure();
            this.changed(true);
        }));
        el('lp-cross').addEventListener('click', () => this.perform('cross'));
        el('lp-fold').addEventListener('click', () => this.perform('fold'));
        el('lp-undo').addEventListener('click', () => this.attempt(() => {
            this.requireConfigured();
            this.walk.undo();
            this.selectedIndex = null;
            this.changed(false);
        }));
        el('lp-reset').addEventListener('click', () => this.attempt(() => {
            this.requireConfigured();
            this.walk.reset();
            this.selectedIndex = null;
            this.changed(true);
        }));
        el('lp-enumerate').addEventListener('click', () => this.attempt(() => {
            this.requireConfigured();
            this.family = new LPFamily(this.reference, this.u);
            this.pageStart = 0n;
            this.selectedIndex = null;
            this.loadPage();
            this.changed(true);
        }));
        el('lp-list').addEventListener('click', event => {
            const card = event.target.closest('[data-lp-index]');
            if (card)
                this.attempt(() => this.selectPath(BigInt(card.dataset.lpIndex)));
        });
        el('lp-prev').addEventListener('click', () => this.attempt(() => this.selectPath(this.pageStart - PAGE_SIZE)));
        el('lp-next').addEventListener('click', () => this.attempt(() => this.selectPath(this.pageStart + PAGE_SIZE)));
        el('lp-jump-form').addEventListener('submit', event => {
            event.preventDefault();
            this.attempt(() => {
                const text = field('lp-jump').value.trim();
                if (!/^\d+$/.test(text))
                    throw new Error('请输入从 1 开始的路径编号。');
                this.selectPath(BigInt(text) - 1n);
            });
        });
        el('lp-overlay').addEventListener('change', () => { this.overlay = field('lp-overlay').checked; this.changed(true); });
        el('lp-export-selected').addEventListener('click', () => this.attempt(() => {
            this.requireConfigured();
            downloadJSON('lp-folding-A2.json', this.exportData());
        }));
        el('lp-export-all').addEventListener('click', () => this.attempt(() => {
            this.requireConfigured();
            if (!this.family)
                throw new Error('请先枚举 LP foldings。');
            if (this.family.total > 10000n)
                throw new Error('整批导出最多 10,000 条；全部路径仍可分页浏览及逐条导出。');
            const paths = [];
            for (let i = 0n; i < this.family.total; i++)
                paths.push({ index: String(i + 1n), ...describeLPPath(this.reference, this.u, this.family.pathAt(i)) });
            downloadJSON('lp-all-foldings-A2.json', { schema: 'lp-foldings-v1', mode: 'lp', schubertInput: [...this.u], totalPaths: String(this.family.total), paths });
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
        el('lp-error').textContent = '';
        try {
            action();
        }
        catch (error) {
            el('lp-error').textContent = error.message;
        }
    }
    configure() {
        const weight = { a: integer('lp-a'), b: integer('lp-b') };
        const wordText = field('lp-reference-input').value.trim();
        const word = !wordText ? undefined : /^(e|1_W)$/i.test(wordText) ? [] : parseWord(wordText);
        const reference = lpReference(weight, word);
        const input = LP_INPUTS.find(item => item.id === select('lp-u').value);
        if (!input)
            throw new Error('请选择 S₃ 中的 Schubert input u。');
        const walk = new LPWalk(reference, input.permutation);
        const original = new LPWalk(reference, input.permutation);
        original.loadActions(reference.word.map(() => 'cross'));
        this.reference = reference;
        this.walk = walk;
        this.referencePath = original.path;
        this.u = [...input.permutation];
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
            throw new Error('请先固定 LP 参考路径。');
        if (this.dirty)
            throw new Error('输入已更改，请先点击「固定 LP 参考路径」。');
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
            throw new Error(`路径编号应介于 1 和 ${this.family?.total ?? 1} 之间。`);
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
        el('lp-work').hidden = !this.walk;
        el('lp-family').hidden = !this.family;
        if (!this.walk || !this.reference)
            return;
        const ref = this.reference, { a, b } = ref.weight;
        el('lp-reference-summary').textContent = `λ = (${a})ω₁ + (${b})ω₂ · A₀ − λ = ${alcoveKey(ref.target)} · ${ref.word.length} 步 reduced path`;
        el('lp-reference-roots').textContent = ref.reflections.map((r, i) => `${i + 1}: β = ${r.betaSign < 0 ? '−(' : ''}${rootLabel(r.root)}${r.betaSign < 0 ? ')' : ''}, r̄ = ${permutationKey(r.finite)}`).join(' · ') || '空参考路径';
        el('lp-current').textContent = `几何起点 A₀ · ${this.walk.complete ? '最终 alcove' : '当前 alcove'} ${alcoveKey(this.walk.current)}`;
        el('lp-progress').textContent = this.dirty ? '设置已修改，固定参考路径后再继续。' : `已完成 ${this.walk.position} / ${ref.word.length} 步${this.selectedIndex === null ? '' : ` · 枚举路径 #${this.selectedIndex + 1n}`}`;
        const next = this.next;
        el('lp-next-wall').textContent = next ? `第 ${this.walk.position + 1} 步 · s${SUB[ref.word[this.walk.position]]} · ${next.wall.equation}` : '—';
        el('lp-reference-reflection').textContent = next ? `${next.referenceReflection.label} · 原墙 ${next.referenceReflection.wall.equation} · r̄ = ${permutationKey(next.referenceReflection.finite)}` : '—';
        el('lp-v').textContent = `v = ${permutationKey(this.walk.v)}（输入 u = ${permutationKey(this.u)}）`;
        el('lp-candidate').textContent = next ? `v r̄${this.walk.position + 1} = ${permutationKey(next.candidate)}` : '—';
        el('lp-lengths').textContent = next ? `ℓ(v) = ${next.length} → ℓ(v r̄) = ${next.candidateLength}` : '—';
        el('lp-fold-reason').textContent = this.dirty ? '输入已修改，请先重新固定参考路径。' : next ? next.reason : '参考位置已全部处理。';
        el('lp-cross').textContent = next ? `Cross · c${SUB[ref.word[this.walk.position]]}${next.crossingSign > 0 ? '⁺' : '⁻'}` : 'Cross';
        el('lp-fold').textContent = next ? `Fold · f${SUB[ref.word[this.walk.position]]}${next.side > 0 ? '⁺' : '⁻'}${next.canFold ? '' : '（禁止）'}` : 'Fold';
        el('lp-cross').toggleAttribute('disabled', !next);
        el('lp-fold').toggleAttribute('disabled', !next?.canFold);
        el('lp-undo').toggleAttribute('disabled', this.dirty || !this.walk.position);
        el('lp-reset').toggleAttribute('disabled', this.dirty || !this.walk.position);
        el('lp-enumerate').toggleAttribute('disabled', this.dirty);
        el('lp-export-selected').toggleAttribute('disabled', this.dirty);
        el('lp-export-all').toggleAttribute('disabled', this.dirty || !this.family || this.family.total > 10000n);
        el('lp-complete-note').textContent = this.dirty ? '当前图仍显示已固定的旧参考路径。' : this.walk.complete ? '路径已完成。最终 alcove 是几何对象；输出 w 是 Schubert 指标。' : next?.canFold ? 'Cross 改变 alcove；Fold 改变 Bruhat 元素。两种操作均占用当前参考位置。' : '本步必须 Cross；Bruhat 元素保持不变。';
        el('lp-positions').textContent = `J = {${this.path.foldingPositions.join(', ')}}`;
        el('lp-chain').textContent = `Bruhat 链：${this.path.bruhatChain.map(permutationKey).join(' ⋗ ')}`;
        el('lp-output-w').textContent = this.walk.complete ? `输出 Schubert 指标 w = ${permutationKey(this.path.outputW)}` : '输出 w：完成全部参考位置后确定';
        const data = describeLPPath(ref, this.u, this.path);
        if (this.walk.complete && data.term)
            el('lp-term').innerHTML = `K-theory 项：${termHTML(data.term, this.path.outputW)}`;
        else
            el('lp-term').textContent = 'K-theory 项：当前为路径前缀，尚未完成';
        if (!this.family)
            return;
        el('lp-total').textContent = this.family.total.toLocaleString();
        el('lp-page-info').textContent = `${this.pageStart + 1n}–${this.pageStart + BigInt(this.page.length)} / ${this.family.total} 条 · 保留全部 J，不按 alcove 或 w 去重${this.family.total > 10000n ? ' · 整批导出上限 10,000 条' : ''}`;
        el('lp-prev').toggleAttribute('disabled', this.dirty || this.pageStart === 0n);
        el('lp-next').toggleAttribute('disabled', this.dirty || this.pageStart + PAGE_SIZE >= this.family.total);
        el('lp-list').innerHTML = this.page.map(({ index, path }) => {
            const details = describeLPPath(ref, this.u, path);
            return `<button type="button" class="lp-card${index === this.selectedIndex ? ' selected' : ''}" data-lp-index="${index}" aria-pressed="${index === this.selectedIndex}"${this.dirty ? ' disabled' : ''}><span class="lp-card-title">#${index + 1n} · J = {${path.foldingPositions.join(', ')}}</span><span class="lp-actions">${actionLabel(path)}</span><span class="lp-endpoint">最终 alcove ${alcoveKey(path.nodes[path.nodes.length - 1])}</span><span class="lp-card-output">输出 w = ${permutationKey(path.outputW)} · ${path.bruhatChain.map(permutationKey).join(' ⋗ ')}</span><span class="lp-term">${details.term ? termHTML(details.term, path.outputW) : '—'}</span></button>`;
        }).join('');
        field('lp-jump').value = String((this.selectedIndex ?? this.pageStart) + 1n);
    }
    exportData() {
        if (!this.walk || !this.reference)
            return null;
        return { schema: 'lp-folding-v1', mode: 'lp', totalPaths: this.family?.total.toString() ?? null,
            ...describeLPPath(this.reference, this.u, this.path) };
    }
    save() {
        if (!this.reference || !this.walk)
            return;
        try {
            localStorage.setItem(STORAGE, JSON.stringify({ active: this.active, weight: this.reference.weight, word: this.reference.word,
                customReference: this.customReference, u: this.u, actions: this.path.steps.map(s => s.kind), enumerated: !!this.family,
                selectedIndex: this.selectedIndex?.toString() ?? null, pageStart: this.pageStart.toString(), overlay: this.overlay }));
        }
        catch { /* Optional persistence. */ }
    }
    restore() {
        try {
            const raw = localStorage.getItem(STORAGE);
            if (!raw)
                return;
            const data = JSON.parse(raw);
            const input = LP_INPUTS.find(item => item.id === permutationKey(data.u));
            if (!input)
                return;
            const reference = lpReference(data.weight, data.word);
            const walk = new LPWalk(reference, input.permutation);
            walk.loadActions(data.actions);
            const original = new LPWalk(reference, input.permutation);
            original.loadActions(reference.word.map(() => 'cross'));
            this.walk = walk;
            this.reference = reference;
            this.referencePath = original.path;
            this.u = [...input.permutation];
            this.active = data.active === true;
            this.overlay = data.overlay !== false;
            if (data.enumerated) {
                this.family = new LPFamily(reference, this.u);
                const startIndex = BigInt(data.pageStart ?? '0');
                this.pageStart = startIndex >= 0n && startIndex < this.family.total ? startIndex / PAGE_SIZE * PAGE_SIZE : 0n;
                const index = data.selectedIndex == null ? null : BigInt(data.selectedIndex);
                this.selectedIndex = index !== null && index >= 0n && index < this.family.total ? index : null;
                if (this.selectedIndex !== null) {
                    const selected = this.family.pathAt(this.selectedIndex);
                    if (selected.steps.map(s => s.kind).join() !== walk.path.steps.map(s => s.kind).join())
                        this.selectedIndex = null;
                }
                this.loadPage();
            }
            field('lp-a').value = String(reference.weight.a);
            field('lp-b').value = String(reference.weight.b);
            select('lp-u').value = input.id;
            this.customReference = data.customReference === true;
            field('lp-reference-input').value = this.customReference ? (reference.word.join(' ') || 'e') : '';
            field('lp-overlay').checked = this.overlay;
            this.render();
        }
        catch {
            this.active = false;
            this.walk = null;
            this.reference = null;
            this.referencePath = null;
            this.family = null;
            this.page = [];
            this.render();
        }
    }
}
