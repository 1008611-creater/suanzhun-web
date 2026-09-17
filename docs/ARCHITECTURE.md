# 技术架构

## 分层

```text
页面层       index.html / paipan.html
交互层       app.js
领域计算层   bazi.js / analysis.js
质量层       scripts/verify.mjs / tests/
资源层       favicon.svg / apple-touch-icon.png / og-image.png（由 scripts/build-assets.mjs 生成）
部署层       Nginx 静态目录 /srv/suanzhun/public
运行时层     deploy/nginx.conf + deploy/docker-compose.yml -> /srv/suanzhun/
```

## 数据流

`表单输入 → readForm → BaZi.paipan → MingLi 分析 → render → #result`

合婚路径为：

`主盘 → 伴侣表单 → 第二份 BaZi → hehun → 合婚卡片`

## 稳定性边界

- 计算模块不得依赖 DOM。
- 页面层不得自行复制四柱算法。
- 新增分析字段必须同步补充测试与文档。
- 任何服务端化或账户化改造都应先更新 PRD 和数据处理说明。

## 运行时拓扑

```text
浏览器 -> Caddy（TLS、安全响应头） -> suanzhun-web（nginx:1.27-alpine）
       -> /srv/suanzhun/public 只读挂载
```

- 容器名固定为 `suanzhun-web`，Caddy 以该服务名反代，改名会断站。
- Nginx 配置只负责压缩、缓存与 404 兜底；TLS 与安全响应头由上层 Caddy 承担。
- 基础设施文件由仓库 `deploy/` 同步到 `/srv/suanzhun/`，通过 `npm run deploy -- --with-infra` 执行。
