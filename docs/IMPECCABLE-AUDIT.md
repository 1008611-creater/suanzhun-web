# Impeccable Audit · Round 2 Baseline

## Scope

Static homepage and排盘页 after the Hallmark redesign. This is a technical UI audit, not a calculation audit.

## Initial findings

| Dimension     |     Score | Finding                                                                                      |
| ------------- | --------: | -------------------------------------------------------------------------------------------- |
| Accessibility |       3/4 | Labels and native controls exist; focus and result announcements need explicit verification. |
| Performance   |       3/4 | Static assets are lean; ambient texture must remain CSS-only and transform-only.             |
| Theming       |       2/4 | Tokens exist but legacy inline colors remain in result markup.                               |
| Responsive    |       3/4 | Main breakpoints exist; narrow table overflow and touch targets need checking.               |
| Anti-patterns |       2/4 | Previous centered-card rhythm and gold-on-dark style read as generic fortune-site UI.        |
| **Total**     | **13/20** | Acceptable, significant visual and token work needed.                                        |

## Priority punch list

- P1: Replace centered hero + repeated cards with distinct editorial/workbench structure.
- P1: Convert remaining inline colors to semantic tokens.
- P1: Verify 320/375/414/768px layouts and table overflow.
- P2: Add explicit `:focus-visible`, result live-region semantics, and reduced-motion coverage.
- P2: Keep motion transform/opacity-only and avoid decorative blur overload.

## Positive findings

- The calculation modules are separated from presentation.
- The form already exposes visible labels and native inputs.
- The site is static and easy to recover from a backup.

## Round 3 verification - 2026-09-17

Punch list status: all P1 and P2 items closed.

| Priority | Item                                                                   | Status |
| -------- | ---------------------------------------------------------------------- | ------ |
| P1       | Replace centered hero + repeated cards with editorial/workbench rhythm | done   |
| P1       | Convert remaining inline colors to semantic tokens                     | done   |
| P1       | Verify 320/375/414/768px layouts and table overflow                    | done   |
| P2       | Add explicit `:focus-visible` and result live-region semantics         | done   |
| P2       | Keep motion transform/opacity-only, avoid decorative blur overload     | done   |

Verified in a real browser at 320 / 375 / 414 / 768 / 1280px with the result rendered:

| Check                   | Result                                                                |
| ----------------------- | --------------------------------------------------------------------- |
| Horizontal overflow     | 0 at all five widths; before the fix 320px overflowed 61px, 375px 6px |
| Root cause              | `.actions` kept `grid-column:span 4` on narrow screens; now `1/-1`    |
| Result region semantics | `role=region` + `aria-label` + `aria-live=polite` + `aria-busy`       |
| Focus visibility        | Buttons, inputs, selects and links share one `:focus-visible` ring    |
| Theming                 | Five-element and auspicious colors moved to `--wx-*` / `--xiong*`     |
| Reduced motion          | Covered on both the homepage and the chart page                       |
