# Verification notes

- `tsc -p tsconfig.json`: passed (no diagnostics).
- `npm run test`: 8/8 passed. Coverage includes A₀ walls, global edge type consistency, Coxeter involutions and braid relations, separating-hyperplane length, reduced example, word parser, and walk undo/redo.
- Chromium desktop smoke test (1360×890): no runtime errors; clicked neighbor, returned to A₀, rejected non-neighbor, undo/redo, loaded `s₀ s₂ s₁ s₂`, exported SVG, and checked its XML parsed successfully.
- Chromium mobile smoke test (390×844): no runtime errors or horizontal overflow; resize adjusts view to fit path.

The browser automation sandbox could not navigate directly to loopback URLs, so the test loaded the HTML/CSS and compiled JavaScript into a browser document; the distributed static build uses standard ES module imports.

Reference implementation: https://a2-alcove-studio-4c7f.fangji123.chatgpt.site

**The repository bundle is an independent reconstruction, not the original Sites source.**
