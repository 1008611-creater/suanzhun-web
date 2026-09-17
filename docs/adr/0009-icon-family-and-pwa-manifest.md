# ADR 0009：图标族与 PWA 清单单归属

- 状态：已采纳
- 日期：2026-09-18

## 背景

站点此前只有 `favicon.svg` 与 `apple-touch-icon.png`。真实浏览器与爬虫默认会请求
`/favicon.ico`，这个地址一直返回 404，每个页面的网络面板里都留着一条红色记录；
手机端也无法「添加到主屏幕」，因为缺少 Web App Manifest。

CSP 里其实早已预留 `manifest-src 'self'`，说明清单本就在计划内，只是生成与接线没做完。

## 决策

### 1. 所有图标由 `scripts/build-assets.mjs` 一处生成

该脚本以同一份 SVG 为源，产出 `favicon.svg`、`favicon.ico`（16/32/48 三尺寸）、
`apple-touch-icon.png`（180）、`assets/icon-192.png`、`assets/icon-512.png`
以及 `maskable` 版本的 192/512 两个文件，外加 `site.webmanifest`。

ICO 容器由脚本手写（6 字节头 + 每张 16 字节目录项 + PNG 数据），不引入新的构建依赖。

### 2. maskable 图标单独出图

普通图标在安卓自适应裁切下会被削边，所以主体缩进到 80% 安全区、背景铺满，
单独产出 `icon-maskable-*.png`，在清单里以 `purpose: "maskable"` 声明。

### 3. 三个页面都外链清单，且只有这一处声明

`index.html`、`paipan.html`、`404.html` 都通过 `<link rel="manifest" href="site.webmanifest">`
引用同一份清单；清单的 `start_url` 指向 `/paipan.html`，因为排盘是核心动作。

### 4. 发布与验证同步覆盖

`scripts/deploy.mjs` 的 `FILES` 与 `URLS` 都加入这六个新资源；`deploy/nginx.conf` 与
`scripts/serve.mjs` 为 `.ico` 加长缓存、为 `/site.webmanifest` 加一小时缓存与
`application/manifest+json` 类型；`scripts/verify.mjs` 新增检查，确认清单可解析、
ICO 头合法、发布脚本覆盖到位。

## 后果

- 浏览器与爬虫的 `/favicon.ico` 请求不再 404，网络面板干净。
- 手机浏览器可「添加到主屏幕」，启动直达排盘页，图标在自适应裁切下不变形。
- 代价是上线文件从 13 个增加到 19 个；`docs/RELEASE-RUNBOOK.md` 与 `scripts/deploy.mjs`
  由 `scripts/verify.mjs` 锁死，漏改任何一处都会挡在合并前。
