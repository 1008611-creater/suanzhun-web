# ADR 0001：缓存响应头只允许一个归属

- 状态：已采纳
- 日期：2026-09-17

## 背景

线上拓扑是 `Caddy -> Nginx -> 静态目录`。Caddyfile 位于另一个项目目录
（`deeptutor-public`），不在本仓库里；Nginx 配置在本仓库 `deploy/nginx.conf`。

一次发布后发现同一条响应带两个互相冲突的 `Cache-Control`：

```text
Cache-Control: public, max-age=604800
Cache-Control: no-cache
```

Caddy 把 JS/CSS 标成 7 天缓存，Nginx 又标成 `no-cache`。浏览器取哪一条取决于实现，
用户可能长时间看到旧版本页面，且本地无法复现。

## 决策

**缓存响应头只在 Nginx 一处声明。** Caddy 的 `suanzhun.cauai.fun` 块只保留 TLS、
安全响应头与 `reverse_proxy`，不再设置任何 `Cache-Control`。

本仓库的 `deploy/nginx.conf` 是缓存策略的唯一权威：

| 资源                                                    | 策略                     |
| ------------------------------------------------------- | ------------------------ |
| `.html` / `.js` / `.css`                                | `no-cache`               |
| `.svg` / `.png` / `.jpg` / `.jpeg` / `.webp` / `.woff2` | `public, max-age=604800` |
| `robots.txt` / `sitemap.xml`                            | `public, max-age=3600`   |

本地预览服务器 `scripts/serve.mjs` 必须复刻同一张表，否则「本地正常、线上异常」
这类问题无法在本地暴露。

## 后果

- 改缓存策略只需改一处，但必须同时改 Nginx 与本地预览两处实现，靠 `npm run check` 的
  一致性契约锁死，防止漂移。
- 站点尚未给静态资源加内容哈希，因此 HTML/JS/CSS 只能 `no-cache`；将来引入构建指纹后
  才能改成长期不可变缓存。
- 改 Caddyfile 属于跨项目改动，必须先备份为 `Caddyfile.bak-<日期>-<原因>`，
  再 `caddy validate` 与 `caddy reload`，步骤见 `docs/RELEASE-RUNBOOK.md`。
