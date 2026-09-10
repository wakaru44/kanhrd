# Vendored web fonts

The three families named in `docs/DESIGN-SYSTEM.md` § Typography, served
locally. There is no CDN and no network dependency at runtime: Angular ships
`apps/web/public/**` verbatim (`angular.json` → `assets`), so these land at
`/fonts/…`, which is what the `@font-face` rules in
`apps/web/src/app/shared/typography.scss` request.

**Filenames are a contract.** `typography.scss` and any other lane that
references `/fonts/…` depends on these exact names. Do not rename.

All three families are licensed **SIL Open Font License 1.1**. The full
licence text for each is vendored alongside the binaries
(`LICENSE-*.txt`); the OFL requires the licence to travel with the font.

## Inventory

| File | Bytes | Family | Weights | Subset |
| ---- | ----- | ------ | ------- | ------ |
| `inter-variable.woff2` | 352,240 | Inter Variable 4.001 | `wght` 100–900, `opsz` 14–32 | no — shipped as published |
| `jetbrains-mono-variable.woff2` | 113,592 | JetBrains Mono 2.304 | `wght` 100–800 | no — repackaged TTF → WOFF2 only |
| `shippori-mincho-400.woff2` | 33,700 | Shippori Mincho 3.110 Regular | 400 (static) | yes — Latin |
| `shippori-mincho-600.woff2` | 35,920 | Shippori Mincho 3.110 SemiBold | 600 (static) | yes — Latin |

## Provenance

### Inter — `inter-variable.woff2`

- Source: <https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip>
  (release `v4.1`, font version 4.001, `git-9221beed3`)
- Archive SHA-256: `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e`
- Taken verbatim from `web/InterVariable.woff2` inside that archive. No
  re-compression, no subsetting.
- Licence: SIL OFL 1.1 — `LICENSE-inter.txt` (the archive's `LICENSE.txt`)
- Not subset on purpose: the UI face renders herdr-supplied data (pen names,
  repo paths, branch names), which is not a closed character set.

### JetBrains Mono — `jetbrains-mono-variable.woff2`

- Source: <https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip>
  (release `v2.304`)
- Archive SHA-256: `6f6376c6ed2960ea8a963cd7387ec9d76e3f629125bc33d1fdcd7eb7012f7bbf`
- The upstream release ships the variable face as TTF only
  (`fonts/variable/JetBrainsMono[wght].ttf`, 303,144 bytes); its
  `fonts/webfonts/` directory contains static instances, not the variable
  face. Repackaged to WOFF2 with fontTools 4.60.2:

  ```python
  from fontTools.ttLib import TTFont
  f = TTFont('fonts/variable/JetBrainsMono[wght].ttf')
  f.flavor = 'woff2'
  f.save('jetbrains-mono-variable.woff2')
  ```

  This is a container change only — every table, glyph and axis is carried
  through unaltered (303,144 B TTF → 113,592 B WOFF2, Brotli).
- Licence: SIL OFL 1.1 — `LICENSE-jetbrains-mono.txt` (the archive's `OFL.txt`)
- Not subset on purpose: the mono face backs the terminal, which renders
  arbitrary program output — box drawing, block elements, arrows, symbols.

### Shippori Mincho — `shippori-mincho-400.woff2`, `shippori-mincho-600.woff2`

- Source: <https://github.com/google/fonts/tree/main/ofl/shipporimincho>
  (`ShipporiMincho-Regular.ttf`, `ShipporiMincho-SemiBold.ttf`; font version
  3.110, ttfautohint v1.8.3)
- Licence: SIL OFL 1.1 — `LICENSE-shippori-mincho.txt` (upstream `OFL.txt`)
- **Subset — mandatory.** The upstream faces are full JIS CJK: 8.3 MB and
  8.2 MB respectively. Shipping them whole would put ~16 MB of Japanese
  glyphs on a shell that renders lowercase English headings.
- Tool: `pyftsubset` (fontTools 4.60.2, Brotli 1.2.0):

  ```sh
  pyftsubset ShipporiMincho-<Regular|SemiBold>.ttf \
    --unicodes='U+0000-02FF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2000-206F,U+20A0-20CF,U+2113,U+2122,U+2190-2193,U+2212,U+2215,U+FB00-FB04,U+FEFF,U+FFFD' \
    --layout-features='*' --no-hinting --desubroutinize \
    --flavor=woff2 --output-file=shippori-mincho-<400|600>.woff2
  ```

  That range is Google Fonts' `latin` ∪ `latin-ext` plus General Punctuation
  (which carries `…`, `—`, `·` and the typographic apostrophes used in
  `apps/web/src/app/shared/copy.ts`). It is mirrored verbatim into the
  `unicode-range` descriptor in `typography.scss`, so anything outside it
  falls to the Georgia fallback per-glyph rather than being rendered from a
  half-covered face.
- Sizes: 8,255,752 B → 33,700 B (Regular), 8,180,588 B → 35,920 B (SemiBold).
- Losslessness check: every distinct printable character appearing anywhere
  in `apps/web/src/**/*.{ts,html}` (101 of them, `copy.ts` included) is
  present in the subset cmap — verified against `TTFont.getBestCmap()`, zero
  missing. The display serif is used only for the wordmark, status column
  headings, modal titles, empty-state and 404 headlines and settings section
  headings — all fixed English copy from `copy.ts`, never herdr data.

## Re-vendoring

Nothing in the build regenerates these. To bump a version, redo the steps
above by hand, re-run the cmap check, and update this file. A vendored binary
whose provenance has drifted from this README is worse than no README.
