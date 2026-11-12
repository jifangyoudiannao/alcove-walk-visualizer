# Alcove Studio · A₂

**[在线使用 / Open the live app](https://jifangyoudiannao.github.io/alcove-walk-visualizer/)**

An interactive alcove walk visualizer for the affine Coxeter complex of type \(\widetilde{A}_2\). Built with **TypeScript + native SVG + CSS**, without a runtime UI dependency.

> **Provenance:** This is a source-code **reconstruction** of the earlier interactive site, not a byte-for-byte extraction of its original Sites deployment. Example 2.19(a) `s₀s₂s₁s₂` is included; the other five preset paths are demonstrations and are *not* claimed to be the paper's examples.

## Features

- Triangular tessellation of type \(\widetilde{A}_2\), with consistent s₀ (green), s₁ (red), s₂ (blue) labels **on each edge**.
- Fundamental alcove \(A_0\) highlighted in gold.
- Enter an integral weight \(\lambda=a\omega_1+b\omega_2\), find one reduced gallery to \(A_0-\lambda\), and explore its folded paths.
- Choose all geometric folds, positive folds, or Ram §3.2 signed folds. Exact counts and pagination preserve the complete family without constructing every path at once.
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

Here a positive crossing goes from the negative side to the positive side; a positive fold stays on the positive side. For Ram's rule, this interface fixes the initial alcove to \(A_0\), corresponding to \(w=e\). The reference gallery's first fold would violate the required sign, so **only the original nonfolded gallery remains**. The unrestricted and positive-fold families are not presented as the terms of that theorem, and no Lenart–Postnikov Bruhat-cover admissibility condition is imposed.

Paths are indexed by their complete crossing/folding choices, with crossing branches first. Different paths are retained even if their endpoints coincide. Counts use exact integers; eight paths are loaded per page, and **跳至路径** accepts a one-based path number for direct navigation. The full family is accessible without a truncation cap. The overlay shows the current page, while a selected path can be inspected step by step. **查看 reduced path** restores the reference view; **返回自由绘制** leaves the explorer.

## References

- [Arun Ram, *Alcove walks, Hecke algebras, spherical functions, crystals and column strict tableaux*, §3.1–3.2, Theorem 3.3](https://arxiv.org/pdf/math/0601343#page=13)
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
│   │   └── folded.ts           # Weight galleries, signed folds, exact path counts
│   └── ui/prompt.ts            # Reusable development prompt
├── test/affineA2.test.mjs
├── test/folded.test.mjs
├── scripts/copy-static.mjs
├── tsconfig.json
├── package.json
└── dist/                       # Built static website (may be committed)
```

## Publishing

This repository is public at the owner's request. The `"private": true` field in `package.json` prevents publishing to npm; it does not control GitHub visibility.
