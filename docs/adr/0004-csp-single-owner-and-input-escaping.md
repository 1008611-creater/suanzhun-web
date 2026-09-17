# ADR 0004：CSP 单归属与输入转义

- 状态：已采纳
- 日期：2026-09-18

## 背景

线上响应头已有 HSTS、X-Content-Type-Options、X-Frame-Options、Referrer-Policy 与
Permissions-Policy，但**没有 Content-Security-Policy**。排查时发现一个更严重的问题：

姓名输入会直接拼进 `innerHTML`。在真实浏览器里把姓名填成
`<img src=x onerror="window.__xss=1">`，排盘后脚本确实执行了——这是一个可用的 DOM-XSS。

```
姓名 -> p.name -> kv('姓名', p.name + ...) -> left.innerHTML -> 执行
```

姓名是用户自己填的，页面也没有从 URL 参数取值，所以这不是跨用户攻击；但它是实打实的
注入面，任何后续把排盘结果分享、截图回填、或接入他人输入的功能都会立刻变成可利用漏洞。

## 决策

**1. 输入先转义。** 新增 `esc()` 辅助函数，姓名、性别、未收录字形、笔画备注等所有
来自用户输入、会进入 `innerHTML` 的内容都必须经过它。

**2. 加 CSP，并明确归属。** 策略为：

```
default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none';
object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self'; font-src 'self'; connect-src 'none'; manifest-src 'self';
upgrade-insecure-requests
```

- `script-src 'self'`：站点没有内联脚本、没有 `eval`、没有内联事件处理器，所以不需要
  `'unsafe-inline'`。这是本次最有价值的一条。
- `style-src` 保留 `'unsafe-inline'`：页面仍有 `<style>` 块与 `style=` 属性。
- `connect-src 'none'`：所有计算都在浏览器本地完成，不需要任何网络请求。
- `frame-ancestors 'none'` + `X-Frame-Options`：双保险防点击劫持。

**3. CSP 写在 Nginx，与本地预览逐字对齐。** `scripts/serve.mjs` 导出 `CSP` 常量，
`deploy/nginx.conf` 用 `set $csp` 定义同一份字符串，`scripts/verify.mjs` 逐字比对。

## 踩过的坑：nginx `add_header` 不继承

nginx 的 `add_header` 不是累加语义：**只要某个 `location` 自己写了 `add_header`，
服务器层的 `add_header` 对该 location 整组失效。**

本配置里 `.html/.js/.css`、图片、`robots.txt`、`sitemap.xml` 四个 location 都写了
`Cache-Control`，因此只在 `server` 层写一次 CSP 会导致这些响应**恰恰没有 CSP**——
也就是最需要 CSP 的 HTML 和脚本反而裸奔。所以每个设置缓存的 location 都必须自己
再写一遍 `add_header Content-Security-Policy $csp always;`。

这一点已在真实 `nginx:1.27-alpine` 容器里验证：所有 200/404 响应都带 CSP，
浏览器加载首页、排盘页并完成一次完整排盘，控制台 **0 条 CSP 违规、0 报错**。

## 后果

- 新增任何内联脚本、内联事件处理器或外部资源，都会与 CSP 冲突；必须先改策略并说明理由。
- 新增 `location` 且在其中写 `add_header` 时，必须同时补 CSP，否则质量门会失败。
- `scripts/verify.mjs` 新增 4 项契约：CSP 逐字一致、缓存 location 都带 CSP、
  输入经 `esc()` 转义、页面无内联脚本。
- 所有闸门都做过反向验证（删掉转义、删掉某处 CSP、改漂移一处取值），确认会真的失败，
  而不是恒真。
