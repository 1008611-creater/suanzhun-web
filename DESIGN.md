# 算的准 Design System

## Genre
editorial / almanac-workbench

## Macrostructure family
- Marketing: Long Document with an editorial index rail
- App: Workbench, input rail + report canvas
- Content: Almanac sheet, reading column + marginal notes

## Theme
- Paper: oklch(98% 0.018 355)
- Paper-2: oklch(94% 0.035 350)
- Ink: oklch(28% 0.035 345)
- Ink-2: oklch(48% 0.045 345)
- Rule: oklch(86% 0.055 350)
- Accent: oklch(50% 0.15 350)
- Accent-2: oklch(68% 0.12 20)
- Jade: oklch(60% 0.09 165)
- Focus: oklch(55% 0.16 350)

## Typography
- Display: `"Songti SC", "Noto Serif SC", serif`, roman, 600
- Body: `"PingFang SC", "Microsoft YaHei", sans-serif`, 400
- Mono: `ui-monospace, SFMono-Regular, monospace`, 500
- Headings never italic.

## Spacing
4-point scale: 4, 8, 12, 16, 24, 32, 48, 72, 112px.

## Motion
- Reveal: opacity + 12px vertical translation, 680ms expo-out.
- Ambient: slow opacity/transform-only constellation drift.
- Interaction: 180–240ms transform and color transitions.
- Reduced motion: opacity-only crossfade <=150ms.

## Component voice
- Primary CTA: solid berry pill with compact editorial verb.
- Secondary CTA: hairline rule, no filled ghost rectangle.
- Dividers: 1px tinted rules and small circular markers.
- Cards: only for data groups; use open sections elsewhere.

## Accessibility
- Visible focus ring.
- Root overflow clipped, no horizontal scrolling.
- Inputs always have visible labels.
- Touch targets >=44px.
