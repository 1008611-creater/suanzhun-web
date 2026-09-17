# ADR 0007：设计令牌单归属与内联样式禁令

- 状态：已采纳
- 日期：2026-09-18

## 背景

改版之前，三个页面的样式分三处维护：`index.html`、`paipan.html`、`404.html` 各自带一块 `<style>`，
`app.js` 里还有大量 `style="color:..."` 拼在内联 HTML 字符串上。由此产生三个真实问题：

1. **改一处漏两处。** 同一个卡片色值抄了三份，改一次要在三个文件里对齐，线上和本地容易不一致。
2. **CSP 只能放宽。** `style-src` 一旦允许 `'unsafe-inline'`，任何注入到页面的内容都能带样式，
   安全收益被自己放弃。
3. **对比度无法被验证。** 令牌散落各处时，`scripts/check-contrast.mjs` 不知道该信任哪一份，
   上一轮就出现过「深底深字」和「五行原色直接当文字色」共 20 多处不达 WCAG AA。

## 决策

### 1. 令牌只有一份归属：`assets/tokens.css`

`:root` 变量全部搬进 `assets/tokens.css`，三个页面只通过 `<link>` 引用。
对比度脚本、验证脚本都只读这一个文件，令牌值改动会同时触发对比度检查。

### 2. 组件样式只有一份归属：`assets/site.css`

所有布局、组件、动效、打印样式、空状态集中在 `assets/site.css`。
页面里不允许再出现 `<style>` 块或 `style="..."` 属性。
`app.js` 动态渲染时只切类名，需要连续量（五行条宽度）时走 CSSOM 的 `fill.style.width`，
它不受 `style-src` 限制。

### 3. CSP 收紧到 `style-src 'self'`

`scripts/serve.mjs` 与 `deploy/nginx.conf` 同时改为 `style-src 'self'`，去掉 `'unsafe-inline'`。
两处逐字一致，由 `tests/preview.test.mjs` 与 `scripts/verify.mjs` 双向锁定。

### 4. 验证脚本把「无内联样式」写成契约

`scripts/verify.mjs` 新增检查：页面无内联样式、页面外链 tokens 与 site、tokens 定义 `:root`、
存在 `prefers-reduced-motion` 分支。这些检查只增不减，防止样式回潮。

## 后果

- 改配色只需要动 `assets/tokens.css` 一处，`npm run contrast` 立刻给出所有不合格项。
- `style-src` 不再有 `'unsafe-inline'`，用户输入即使被转义遗漏也无法注入样式。
- 代价是 `app.js` 不能再写内联样式，渲染代码需要多维护一层类名映射
  （`WX_KEY` 把五行映射到 `is-mu` / `is-huo` 等类名）。这是可接受的交换。
- 新增页面必须同时挂两个样式表，`scripts/verify.mjs` 会在缺失时报错。
