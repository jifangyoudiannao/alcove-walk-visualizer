# Alcove Studio · A₂

**[在线使用 / Open the live app](https://jifangyoudiannao.github.io/alcove-walk-visualizer/)**

An interactive alcove walk visualizer for the affine Coxeter complex of type \(\widetilde{A}_2\). Built with **TypeScript + native SVG + CSS**, without a runtime UI dependency.

> **Provenance:** This is a source-code **reconstruction** of the earlier interactive site, not a byte-for-byte extraction of its original Sites deployment. Example 2.19(a) `s₀s₂s₁s₂` is included; the other five preset paths are demonstrations and are *not* claimed to be the paper's examples.

## Features

- Triangular tessellation of type \(\widetilde{A}_2\), with consistent s₀ (green), s₁ (red), s₂ (blue) labels **on each edge**.
- Fundamental alcove \(A_0\) highlighted in gold.
- Enter an integral weight \(\lambda=a\omega_1+b\omega_2\), find one reduced gallery to \(A_0-\lambda\), and explore its folded paths.
- Independent **Ram Alcove Walk Mode**: choose a reference to \(A_0+\lambda\), start at any of the six finite-Weyl alcoves \(wA_0\), execute only legal crossings/folds, or enumerate every legal walk.
- Independent **LP Admissible Foldings**: keep the geometry at \(A_0\), choose a Schubert input \(u\in S_3\), and enumerate exactly the decreasing Bruhat-cover foldings of a reference to \(A_0-\lambda\), with equivariant K-theory terms.
- The earlier \(A_0-\lambda\) explorer retains all geometric folds, positive folds, and the fixed-start \(w=e\) Ram specialization. Exact counts and pagination preserve the complete family.
- Click an adjacent alcove to add a point, arrow, and numbered step. Only edge-adjacent moves are allowed. Return moves are recorded rather than erased.
- Optional snap-to-center, pan (space + drag or hand tool), wheel zoom, recenter, fit path.
- Coxeter word, shortest gallery length, reduced/non-reduced indication, visited alcove count, step log.
- Enter a word such as `0 2 1 2` or `s₀ s₂ s₁ s₂` and draw its full gallery.
- Undo/redo, localStorage persistence, copy word, download JSON, download the **complete route** as SVG.
- No backend or account required; the app runs locally and offline except for optional Google Fonts.

## Local setup

Requires Node.js 18+.

```bash
npm install
npm run build
npm run test
npm start
```

Open **http://localhost:8000**. `npm start` uses Python 3; alternatively, serve the `dist/` directory with any static file server.

If TypeScript (`tsc`) is already installed globally, you can also run `tsc -p tsconfig.json && node scripts/copy-static.mjs` without `npm install`.

## Mathematics

Use root coordinates

\[
x=\langle v,\alpha_1^\vee\rangle, \qquad y=\langle v,\alpha_2^\vee\rangle.
\]

The affine hyperplanes are \(x=n\), \(y=n\), and \(x+y=n\) for integer \(n\). The fundamental alcove is \(x>0,y>0,x+y<1\). Every unit square has two triangular alcoves `L(i,j)` and `U(i,j)`.

A vertex \((i,j)\) has Coxeter type \((i+2j)\bmod 3\). An alcove wall has the type of the *opposite vertex*. This ensures three distinct wall labels per triangle and consistent labels on shared walls. **Do not color every parallel line with the same label**: sᵢ is the Coxeter wall type, not the affine-root direction.

A gallery transition across the type-\(i\) wall is interpreted as right multiplication \(w \mapsto ws_i\). The Coxeter length is the number of separating affine hyperplanes. For `L(i,j)` and `U(i,j)`, respectively,

\[
\ell(L(i,j))=|i|+|j|+|i+j|,\qquad
\ell(U(i,j))=|i|+|j|+|i+j+1|.
\]

A gallery is reduced precisely when its number of steps is the Coxeter length of its endpoint.

## Weight input and folded paths

In the new **Weight → 折叠路径** panel, enter the two fundamental-weight coefficients:

\[
\lambda=a\omega_1+b\omega_2,\qquad a,b\in\mathbb Z.
\]

For example, `a = 1`, `b = 0` means \(\lambda=\omega_1\). Positive, negative, mixed, and zero coefficients are supported. The target is the geometric alcove `L(-a,-b)`, and the reduced gallery length is

\[
m=|a|+|b|+|a+b|.
\]

The implementation repeatedly crosses a wall that decreases the number of separating hyperplanes from the target by one, with a fixed wall-type ordering to make the chosen gallery deterministic. This finds **one** reduced gallery, not all possible reduced galleries. Reference galleries longer than 60 steps are rejected with an explanatory message.

Every integral weight is allowed; it need not lie in the root lattice. Translation by a general weight can permute the vertex types. Accordingly, the displayed Coxeter word reaches the geometric alcove \(A_0-\lambda\); it is not identified with the extended-affine translation element \(t_{-\lambda}\) when a length-zero factor is required.

Fix the reference gallery's wall-type sequence \((j_1,\ldots,j_m)\). At step \(k\), find the type-\(j_k\) wall **in the current alcove**. A crossing moves through that wall. A fold touches the wall and returns to the current alcove. After a fold, subsequent walls are recomputed from the new current state; the original absolute wall locations are not reused. Folded paths can therefore have endpoints other than \(A_0-\lambda\).

The rule selector distinguishes three different families:

| Rule | Allowed folds |
| --- | --- |
| 每墙均可折叠 / All geometric folds | Every step permits either crossing or folding. This follows the geometric definition supplied for this feature; there are exactly \(2^m\) action sequences. |
| 仅正折叠 / Positive folds | A fold must stay on the positive side of its wall. For walls \(x=n\), \(y=n\), and \(x+y=n\), the positive side uses \(>n\). |
| Ram §3.2 | As in Theorem 3.3, the fold sign at step \(k\) must equal the reference crossing sign \(\epsilon_k\). Equivalently, the crossing available from the current alcove must have sign \(-\epsilon_k\). |

Here a positive crossing goes from the negative side to the positive side; a positive fold stays on the positive side. For Ram's rule, this older weight-explorer panel fixes the initial alcove to \(A_0\), corresponding to \(w=e\). The reference gallery's first fold would violate the required sign, so **only the original nonfolded gallery remains**. The separate Ram Alcove Walk Mode below allows a nonidentity initial direction. The unrestricted and positive-fold families in this older panel are not presented as the terms of that theorem, and no Lenart–Postnikov Bruhat-cover admissibility condition is imposed.

Paths are indexed by their complete crossing/folding choices, with crossing branches first. Different paths are retained even if their endpoints coincide. Counts use exact integers; eight paths are loaded per page, and **跳至路径** accepts a one-based path number for direct navigation. The full family is accessible without a truncation cap. The overlay shows the current page, while a selected path can be inspected step by step. **查看 reduced path** restores the reference view; **返回自由绘制** leaves the explorer.

## Ram Alcove Walk Mode

Select **Ram Alcove Walk Mode** above the sidebar controls. This mode has independent path state; the original drawing mode and its undo/redo history remain available through **自由绘制**.

1. Enter \(\lambda=a\omega_1+b\omega_2\). Here the reference path goes from \(A_0\) to **\(A_0+\lambda\)**, whose coordinate key is `a,b,L`. This plus-sign convention is distinct from the older minus-weight explorer.
2. Choose the actual initial alcove \(wA_0\), with \(w\in\{e,s_1,s_2,s_1s_2,s_2s_1,w_0\}\). The default is \(e\). **载入有折叠的示例** sets up a nonidentity start for exploring branches immediately.
3. Click **固定参考路径** to generate a reduced gallery. Optionally expand **指定参考 reduced word** and enter a wall-type word; it must be reduced and terminate at the selected \(A_0+\lambda\). The 60-step reference limit applies here too.
4. At every step, inspect the highlighted actual wall, the current alcove's side, and the reference sign. Click **Crossing** or **Folding** when enabled. **上一步** undoes one operation and **重置本条** returns to the configured starting alcove.
5. Click **Enumerate All Ram Walks** to obtain the exact total and browse all legal results. Click a result to highlight its full operation sequence; pagination and direct path-number navigation never merge paths with equal endpoints.

The reference path fixes wall types \((j_1,\ldots,j_m)\) and signs \((\varepsilon_1,\ldots,\varepsilon_m)\). Actual walls are recalculated in the **current** alcove after each operation. For an affine wall \(H_{\alpha,n}\), the positive side means \(\langle x,\alpha^\vee\rangle>n\); color and Coxeter type do not determine the side.

| Reference sign | Current side | Allowed operations |
| --- | --- | --- |
| \(+\) | Negative | \(c_i^+\) |
| \(+\) | Positive | \(c_i^-\), \(f_i^+\) |
| \(-\) | Positive | \(c_i^-\) |
| \(-\) | Negative | \(c_i^+\), \(f_i^-\) |

Crossing changes the current alcove to the correct adjacent alcove. Folding keeps the alcove unchanged and is drawn as a return arrow. The log still records a fold as one operation, so repeated state entries are expected; a fold does not add a distinct visited alcove. The UI disables all illegal choices, and the engine independently rejects them.

**Positive Folding Mode** requires a reference whose crossing signs are all positive, as happens for the generated reference of a dominant weight. It permits negative crossings, but every fold is positive. With the default \(w=e\), no first fold is allowed and the Ram family contains only the reference path. Changing the actual initial direction can create branching. No Lenart–Postnikov Bruhat-cover test is used.

Each selected or exported path includes the reference wall types and signs, initial/current/final alcoves, each actual affine wall and side, crossing/folding operations, one-based folding positions \(J\), and positive/negative/total fold counts. The **path coefficient** is

\[
(-1)^{f^-(p)}(q-q^{-1})^{f(p)}.
\]

This coefficient is distinct from Ram's endpoint weight \(\operatorname{wt}(p)\). Alcove positions use exact integer triangle coordinates, never pixels. Extended-affine \(\Omega\) sheets are not tracked, so the application does **not** infer or label a translation weight \(\operatorname{wt}(p)\) or final direction \(\varphi(p)\).

**导出当前 Ram walk** saves the current partial or complete walk. **导出全部路径 JSON** exports every member when the family has at most 10,000 paths; larger families remain fully available through exact counting, pagination, and selected-path export. The top **导出 SVG** exports the displayed route.

The browser performs all calculation locally. `npm run build` produces a complete static `dist/` directory that can be deployed directly to GitHub Pages; no backend is needed.

## LP Admissible Foldings

Select **LP Admissible Foldings** in the mode selector. This mode implements the **\(u\)-admissible** foldings in Lenart–Postnikov's Definition 18.5 and Theorem 6.1. Its state and admissibility rules are independent of Ram mode and free drawing.

1. Enter \(\lambda=a\omega_1+b\omega_2\). The default is \(\omega_1\); the reference endpoint is \(A_0-\lambda\), with key `-a,-b,L`.
2. Select **Schubert input u / Bruhat-chain start**. The default is \(u=w_0=321\). Every geometric path still starts at \(A_0\): changing \(u\) changes only the finite Bruhat-chain state, and never moves the initial alcove or inserts a prefix.
3. Click **固定 LP 参考路径**. Leave the optional reduced word blank to generate one, or enter your own. The engine checks that no actual affine hyperplane is crossed twice, and that the geometric endpoint is correct. Repeated wall-type labels are allowed. As in the other modes, references are limited to 60 steps.
4. At each reference position, compare the **current actual wall** with the **original reference reflection**, then use **Cross** or **Fold**. The panel shows the current finite permutation, its candidate successor, both inversion lengths, and the exact reason a fold is allowed or forbidden. **Undo** restores the alcove, Bruhat element, and folding positions together; **Reset 本条** restores \((A_0,u,\varnothing)\).
5. Click **Enumerate All LP Foldings**, then select any result to show its geometry, operation sequence, folding positions, finite Bruhat chain, output index, and contribution. Different folding sets remain separate even when their final alcoves or output indices coincide. The JSON exports include all these records.

The fixed reference data at position \(k\) are

\[
r_k=g^{\mathrm{ref}}_{k-1}s_{i_k}(g^{\mathrm{ref}}_{k-1})^{-1},
\qquad \bar r_k\in S_3.
\]

These data are computed once from the unfolded reference and remain unchanged after folds. The actual wall used for drawing is always the type-\(i_k\) wall of the **current** alcove. With \(gA_0\) denoting the geometric state and \(v\) the Bruhat state, the updates are:

| Operation | Allowed when | Geometry | Bruhat state |
| --- | --- | --- | --- |
| Cross | Always | \(g\mapsto gs_{i_k}\) | \(v\mapsto v\) |
| Fold | \(\ell(v\bar r_k)=\ell(v)-1\) | \(g\mapsto g\) | \(v\mapsto v\bar r_k\) |

Permutation multiplication is \((ab)(i)=a(b(i))\), so the Bruhat update uses **right multiplication** by the original reference reflection. Lengths are exact inversion numbers. Actual crossing/fold signs may be displayed, but no Ram sign filter is applied. Both operations consume exactly one reference position.

**Example 15.6** can be loaded directly. It uses \(\lambda=\omega_1\), \(u=321\), the wall-type word \((1,2)\), and original reflections \((r_1,r_2)=(s_1,s_1s_2s_1)\). Its three results are:

| Folding set \(J\) | Geometric alcove sequence | Output \(w\) | \(\mu(J)\) |
| --- | --- | --- | --- |
| \(\varnothing\) | \((A_0,s_1A_0,s_1s_2A_0)\) | \(321=w_0\) | \(-\omega_2\) |
| \(\{1\}\) | \((A_0,A_0,s_2A_0)\) | \(231=s_1s_2\) | \(-\omega_1+\omega_2\) |
| \(\{1,2\}\) | \((A_0,A_0,A_0)\) | \(132=s_2\) | \(\omega_1\) |

The set \(\{2\}\) is forbidden: \(321\bar r_2=123\) drops the length from 3 to 0, rather than by 1. Changing only \(u\) to \(123=e\) leaves just \(J=\varnothing\), because \(e\) has no descending Bruhat cover. This is unrelated to the geometric starting alcove, which is \(A_0\) in every case.

For each complete path the implementation calculates

\[
\mu(J)=-u\,r_{j_1}\cdots r_{j_s}(-\lambda),
\qquad
(-1)^{n(J)}x^{\mu(J)}[\mathcal O_{w(J)}].
\]

Here \(n(J)\) counts the **negative roots of the original reference \(\lambda\)-chain** at selected positions. It is not the number of actual negative folds. General signed integral weights use this sign rule; for dominant \(\lambda\), every contribution has positive sign. The designated terminal vertex is exactly \(-\lambda\), not the alcove center or \(g^{\mathrm{ref}}_m(0)\). Reflections and the finite Weyl action use exact integer weight coordinates. The geometric final alcove and the output Schubert index \(w(J)\) are explicitly separate outputs.

All paths satisfy \(|J|=\ell(u)-\ell(w(J))\); this is an output check, while admissibility is still checked at every fold. Enumeration uses the complete branch tree with exact counts and indexed pagination. The full JSON export is limited to 10,000 paths per file; larger families remain available through pagination and selected-path export.

The mode implements the LP **K-theory** combination rule. It does not use Ram's \((q-q^{-1})^{|J|}\) factor, and it does not claim an elliptic Chevalley formula. The tests include the exact Example 15.6, the \(u=e\) specialization, the length identity, and comparison with independent enumeration of all folding subsets.

Validation: `npm test` passes all 41 tests (11 LP tests plus 30 existing tests). The independent subset oracle compares 150 families (25 signed weights and all six inputs) and 628 complete paths, including every operation, alcove, Bruhat chain, and output index. A separate ambient-coordinate oracle checks the equivariant exponents and signs, including nonzero affine levels. Browser checks cover manual choices, forbidden folds, undo/reset, mode isolation, persistence, pagination, custom references, and JSON/SVG exports.

## References

- [Arun Ram, *Alcove walks, Hecke algebras, spherical functions, crystals and column strict tableaux*, §3.1–3.2, Theorem 3.3](https://arxiv.org/pdf/math/0601343#page=13)
- [Cristian Lenart and Alexander Postnikov, *Affine Weyl Groups in K-Theory and Representation Theory*, Theorem 6.1, §18.1, Definition 18.5, Example 15.6](https://math.mit.edu/~apost/papers/kchevalley-v2.pdf)
- [Rui Xiong, affine notes, p. 75 (alcove diagram)](https://cubicbear.github.io/doc/affineNotes.pdf#page=75)
- [Example 2.19, p. 19 (walks)](https://cubicbear.github.io/doc/affineNotes.pdf#page=19)

## File layout

```text
alcove-walk-visualizer/
├── index.html
├── styles.css
├── src/
│   ├── main.ts                 # SVG rendering + UI interactions
│   ├── math/
│   │   ├── affineA2.ts         # Geometry / Coxeter labeling / length
│   │   ├── walk.ts             # Walk state + undo/redo
│   │   ├── folded.ts           # Earlier weight galleries and geometric folded families
│   │   ├── ram.ts              # Ram local choices, manual execution and exact enumeration
│   │   └── lp.ts               # LP reference reflections, Bruhat covers and K-theory terms
│   └── ui/prompt.ts            # Reusable development prompt
├── test/affineA2.test.mjs
├── test/folded.test.mjs
├── test/ram.test.mjs
├── test/lp.test.mjs
├── scripts/copy-static.mjs
├── tsconfig.json
├── package.json
└── dist/                       # Built static website (may be committed)
```

## Publishing

This repository is public at the owner's request. The `"private": true` field in `package.json` prevents publishing to npm; it does not control GitHub visibility.
