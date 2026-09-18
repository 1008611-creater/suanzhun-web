# 0014 · 品牌链接触控区不小于 44px

## 背景

真实浏览器在 320/375/414px 下测量排盘页报头：`.brand-link`（「算的准」）只有
68×33，低于移动端 44px 命中标准。`DESIGN.md` 的 Accessibility 段写了
「Touch targets >=44px」，`docs/IMPECCABLE-AUDIT.md` 的 Responsive 项也提到
「touch targets need checking」，但这条一直没有落到代码上，属于文档承诺未兑现。

首页与 404 页的同类元素不受影响：首页品牌是纯文字 `div`（不可点），
404 页没有品牌链接。问题只出现在排盘页。

## 决策

1. `.brand-link` 改为 `inline-flex` + `min-height: 44px` + 水平内边距，
   把命中区撑到 76×44，视觉字号与颜色不变。
2. 不在 HTML 里加内联样式或包装元素：CSP 是 `style-src 'self'`，
   样式归属仍是 `assets/site.css` 单点。
3. 新增契约锁死这一条，避免以后重排报头时把 `min-height` 删掉。

## 后果

- 320 / 375 / 414 / 768 / 1280px 下品牌链接均为 76×44，全站不再有小于 44px
  的链接或按钮，横向溢出仍为 0。
- `scripts/verify.mjs` 新增 1 项契约，契约数 63 → 64；README 同步。
- 报头整体高度略微增加（约 11px），不改变布局结构。

## 取代关系

无。新增决策，不改历史。
