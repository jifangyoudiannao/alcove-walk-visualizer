# Alcove Studio · A₂

**[在线使用 / Open the live app](https://jifangyoudiannao.github.io/alcove-walk-visualizer/)**

An interactive alcove walk visualizer for the affine Coxeter complex of type \(\widetilde{A}_2\). Built with **TypeScript + native SVG + CSS**, without a runtime UI dependency.

> **Provenance:** This is a source-code **reconstruction** of the earlier interactive site, not a byte-for-byte extraction of its original Sites deployment. Example 2.19(a) `s₀s₂s₁s₂` is included; the other five preset paths are demonstrations and are *not* claimed to be the paper's examples.

## Features

- Triangular tessellation of type \(\widetilde{A}_2\), with consistent s₀ (green), s₁ (red), s₂ (blue) labels **on each edge**.
- Fundamental alcove \(A_0\) highlighted in gold.
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
x=\langle\alpha_1,v\rangle, \qquad y=\langle\alpha_2,v\rangle.
\]

The affine hyperplanes are \(x=n\), \(y=n\), and \(x+y=n\) for integer \(n\). The fundamental alcove is \(x>0,y>0,x+y<1\). Every unit square has two triangular alcoves `L(i,j)` and `U(i,j)`.

A vertex \((i,j)\) has Coxeter type \((i+2j)\bmod 3\). An alcove wall has the type of the *opposite vertex*. This ensures three distinct wall labels per triangle and consistent labels on shared walls. **Do not color every parallel line with the same label**: sᵢ is the Coxeter wall type, not the affine-root direction.

A gallery transition across the type-\(i\) wall is interpreted as right multiplication \(w \mapsto ws_i\). The Coxeter length is the number of separating affine hyperplanes. For `L(i,j)` and `U(i,j)`, respectively,

\[
\ell(L(i,j))=|i|+|j|+|i+j|,\qquad
\ell(U(i,j))=|i|+|j|+|i+j+1|.
\]

A gallery is reduced precisely when its number of steps is the Coxeter length of its endpoint.

## References

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
│   │   └── walk.ts             # Walk state + undo/redo
│   └── ui/prompt.ts            # Reusable development prompt
├── test/affineA2.test.mjs
├── scripts/copy-static.mjs
├── tsconfig.json
├── package.json
└── dist/                       # Built static website (may be committed)
```

## Publishing

This repository is public at the owner's request. The `"private": true` field in `package.json` prevents publishing to npm; it does not control GitHub visibility.
