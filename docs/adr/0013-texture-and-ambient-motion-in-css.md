# 0013 · 网感纹理与环境漂移由 CSS 单点实现

## 背景

`DESIGN.md` 的 Motion 段写了「Reveal: opacity + 12px vertical translation, 680ms expo-out」
与「Ambient: slow opacity/transform-only constellation drift」，但 `assets/site.css` 里
实际只有一条 `fadeUp`；三个页面也只有首页 hero 挂了 `.reveal`。文档承诺的「网感纹理」
更是全仓没有任何实现。审计（`docs/IMPECCABLE-AUDIT.md` 的 P2「避免装饰性模糊堆叠」）
因此标了 done，属于文档与实现不一致。

## 决策

1. **纹理只允许纯 CSS 渐变。** CSP 是 `img-src 'self'`，外链纹理图与 data-URI 都会被挡；
   与其为一张噪声图放宽 CSP、再加进 deploy 清单，不如用 `radial-gradient` +
   `repeating-linear-gradient` 叠出颗粒与细斜纹，零额外请求、零字节资源。
2. **纹理与环境漂移各占一层伪元素。** `body::before` 是静止颗粒纹理，
   `body::after` 是缓慢漂移的星座点阵。两层都是 `position: fixed` + `z-index: -1` +
   `pointer-events: none`，只做装饰，不吃点击、不参与布局。
3. **漂移只改 transform 与 opacity。** 不做 blur、不改尺寸与位置属性，
   避免每帧重排；元素比视口大一圈，漂移时不露边。
4. **减少动效与打印都要显式处理。** `prefers-reduced-motion: reduce` 下漂移停住
   （`animation: none`）、入场动画延迟清零（否则「先隐形再跳出」比动画本身更刺眼）；
   `@media print` 下两层直接 `display: none`，避免纸面发灰。
5. **错峰入场由 `.stagger` 承担。** 首页能力清单、价格表、步骤、排盘表单、
   报告卡片都走同一组 `.stagger > *:nth-child()` 延迟，最后一档 360ms，
   加 680ms 动画仍在 500ms 排队预算内（动画本身可继续跑完）。

## 后果

- 纹理与动效的归属仍是 `assets/site.css` 单点，页面只挂类名，不写内联样式（CSP 要求）。
- `scripts/verify.mjs` 新增 4 项契约：纹理层存在且为纯 CSS 渐变、漂移动效存在、
  两者尊重减少动效、打印隐藏。契约数 59 → 63。
- 对比度契约不受影响：两层都是装饰层，压在内容之下，文字有效底色仍由 `--card`/`--bg` 决定。

## 取代关系

无。新增决策，不改历史。
