# ADR 0010：键盘焦点可见性与首屏性能预算

- 状态：已采纳
- 日期：2026-09-18

## 背景

PRD 的验收标准写着「键盘可访问」与「首屏 1 秒内显示主要内容」，但两条都只靠人工判断，
没有自动化闸门。真实浏览器实测发现：

1. `.f input` / `.f select` 写了 `outline: none`，优先级高于全局 `:focus-visible`，
   键盘 Tab 到 13 个表单控件时**没有任何可见焦点环**（WCAG 2.4.7 不达标）。
2. 排盘完成后焦点仍留在「开始排盘」按钮上，键盘与读屏用户得手动往下翻才能到报告。
3. 首屏体积没有任何上限，改版时容易悄悄变重。

## 决策

### 1. 焦点环只允许 `:focus-visible` 拥有

删除 `.f input` / `.f select` 的 `outline: none`，聚焦指示统一交给全局 `:focus-visible`
（3px `--focus` 描边 + 2px offset）。`scripts/verify.mjs` 剥掉 CSS 注释后断言：
`:focus-visible` 规则存在，且 `site.css` / `tokens.css` 里不再出现 `outline: none`。

### 2. 排盘结果区可聚焦并自动接收焦点

`paipan.html` 的 `#result` 加 `tabindex="-1"`；`app.js` 渲染完成后 `box.focus()`，
焦点从按钮移到结果区，读屏从报告开头播报，Tab 继续在报告内走。
结果区是程序聚焦（`:focus-visible` 不匹配），因此不会画出多余的焦点框。

### 3. 首屏与脚本设 gzip 体积预算

`scripts/verify.mjs` 用 `zlib.gzipSync` 实测字节数并设上限：
首屏关键资源（页面 HTML + `tokens.css` + `site.css`）≤ 20 KB，
三个脚本合计 ≤ 48 KB。超限即失败，避免「本地看着没问题、用户其实要等」。

### 4. 链接与按钮也必须有可读名称

此前只检查表单控件；补上 `<a>` / `<button>`，图标型控件没有文字又没有
`aria-label` / `title` 即失败。

### 5. Node 版本单一来源

新增 `.nvmrc`（20），CI 用 `node-version-file` 读取，`scripts/verify.mjs` 断言
`.nvmrc` 与 `package.json` 的 `engines.node` 主版本一致。

## 后果

- 键盘用户在每个控件上都能看到焦点位置，排盘后自动跳到报告。
- 首屏与脚本体积被锁死，改版不会悄悄变重。
- 代价是新增 7 项契约（总数 47 → 54），README 与 CI 同步更新。
