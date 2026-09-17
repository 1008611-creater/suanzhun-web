# 发布 Runbook

## 一句话

发布只有一条命令：`npm run deploy`。它把「质量门 → 远端备份 → 差异上传 → 哈希复核 → 线上探活」串成一次可回看的执行。

## 标准发布流程

```powershell
cd E:\WORKBUDDY\Claw\08_其他项目\suanzhun
npm run deploy -- --dry-run   # 先看会改哪些文件，不写入
npm run deploy                # 正式发布
```

脚本按顺序做五件事：

1. 跑 `npm run release:check`（lint + 结构契约 + 回归测试），不通过就中止。
2. 计算 11 个上线文件的本地 sha256，并读取线上同名文件的 sha256。
3. 只对哈希不同的文件执行上传；线上缺失的文件也计入差异。
4. 上传前在远端创建 `/srv/suanzhun/backups/<时间戳>` 全量备份。
5. 上传后重新比对哈希，并逐个请求线上地址确认返回 200。

任一环节失败，脚本以非零码退出并打印原因；已上传的差异文件可用对应时间戳备份回滚。

## 参数与环境变量

| 名称                   | 默认值                                     | 说明                                       |
| ---------------------- | ------------------------------------------ | ------------------------------------------ |
| `--dry-run`            | 关闭                                       | 只做质量门、哈希比对与探活，不上传、不备份 |
| `--skip-check`         | 关闭                                       | 跳过质量门，仅用于排障，正常发布不要使用   |
| `--with-infra`         | 关闭                                       | 一并同步 Nginx / Compose 定义并重建容器    |
| `SUANZHUN_HOST`        | `root@38.76.193.254`                       | 发布目标主机                               |
| `SUANZHUN_SSH_KEY`     | `C:/Users/lsb/.ssh/haika_niannian_ed25519` | SSH 私钥路径，只从本机读取                 |
| `SUANZHUN_REMOTE_DIR`  | `/srv/suanzhun/public`                     | 线上静态目录                               |
| `SUANZHUN_BACKUP_ROOT` | `/srv/suanzhun/backups`                    | 备份根目录                                 |
| `SUANZHUN_BASE_URL`    | `https://suanzhun.cauai.fun`               | 探活基地址                                 |
| `SUANZHUN_INFRA_DIR`   | `/srv/suanzhun`                            | 基础设施文件目录                           |

私钥路径只作为运行时参数使用，不写入仓库、不落盘到工作区。

## 上线文件清单

`index.html`、`paipan.html`、`404.html`、`app.js`、`analysis.js`、`bazi.js`、`favicon.svg`、`apple-touch-icon.png`、`og-image.png`、`robots.txt`、`sitemap.xml`。

这些文件与 `scripts/deploy.mjs` 中的 `FILES` 常量一一对应；新增上线文件必须同时改这里和脚本，否则不会被发布。

## 基础设施文件

`deploy/nginx.conf` 与 `deploy/docker-compose.yml` 上传到 `/srv/suanzhun/`，只在 `--with-infra` 时同步：

```powershell
npm run deploy -- --with-infra --dry-run   # 预览基础设施差异
npm run deploy -- --with-infra             # 同步并重建容器
```

重建流程会先校验 Nginx 配置，再判断现有容器是否由 compose 管理；早期手工 `docker run` 起的容器会被移除后交给 compose 接管。容器名必须保持 `suanzhun-web`，Caddy 通过这个服务名反代，改名会断站。

改这两个文件属于基础设施变更，按 L3 处理：先备份、先 dry-run、确认后再执行。

## 上层 Caddy 与缓存归属

本站在 Caddy 后面再挂一层 Nginx。Caddy 配置不在本仓库里，它属于
`deeptutor-public` 项目：

```text
/srv/kidswear-data/staging/deeptutor-public-20260804-ui-hardening-01/deploy/public/Caddyfile
```

约定：**缓存响应头只在 Nginx 一处声明**，Caddy 的 `suanzhun.cauai.fun` 块只保留 TLS、
安全响应头与 `reverse_proxy`。两层都设 `Cache-Control` 会让同一条响应出现互相冲突的两个头，
浏览器行为取决于实现，属于必须避免的隐患。

改动 Caddyfile 前先备份为 `Caddyfile.bak-<日期>-<原因>`，改完依次执行：

```bash
docker exec deeptutor-public-caddy caddy validate --config /etc/caddy/Caddyfile
docker exec deeptutor-public-caddy caddy reload --config /etc/caddy/Caddyfile
```

`validate` 与 `reload` 都通过后，用 `curl -sI` 复核 HTML/JS 为单条 `no-cache`、
图片为单条 `public, max-age=604800`，并确认 gzip 仍生效。

## 发布后人工确认

脚本只保证「文件到位、地址可访问」。视觉与交互仍要在真实浏览器里看一眼：

1. 375px 与 1280px 下无横向溢出。
2. 排盘表单默认是空表单，出生地为「请选择出生地」，不预填任何个人信息。
3. 排盘结果区正常渲染，无控制台报错。
4. 合婚入口可用，经度留空时沿用主盘经度。

## 回滚

```powershell
ssh -i C:/Users/lsb/.ssh/haika_niannian_ed25519 root@38.76.193.254
cp -a /srv/suanzhun/backups/<时间戳>/. /srv/suanzhun/public/
```

回滚后重新执行 `npm run deploy -- --skip-check` 复核哈希与探活。备份不删除，回滚原因记入本文件。

## 发布记录

### 2026-09-17 0.3.0 首次发布

| 项目     | 值                                             |
| -------- | ---------------------------------------------- |
| 备份     | `/srv/suanzhun/backups/20260917-120000`        |
| 变更文件 | `paipan.html` `app.js` `analysis.js` `bazi.js` |
| 发布后   | 375/1280px 无溢出，无脚本报错                  |

### 2026-09-17 0.3.1 隐私修复

移除表单里写死的真实姓名与生日，改为空表单加 placeholder。

| 项目     | 值                                                          |
| -------- | ----------------------------------------------------------- |
| 备份     | `/srv/suanzhun/backups/20260917-133519`                     |
| 变更文件 | `paipan.html` `app.js`                                      |
| 发布后   | 表单默认清空，默认出生地北京，375/1280px 无溢出，无脚本报错 |

### 2026-09-17 0.3.2 发布流程固化

把手工发布步骤固化为 `npm run deploy`，并补充 dry-run 与脚本自检。

| 项目     | 值                                                                    |
| -------- | --------------------------------------------------------------------- |
| 备份     | 未改动线上文件（仅新增脚本与文档）                                    |
| 变更文件 | 无上线文件变化                                                        |
| 发布后   | `npm run deploy -- --dry-run` 显示 7 个文件哈希一致、7 个地址全部 200 |

### 2026-09-17 0.4.0 站点完备性与基础设施

补齐图标、分享卡片、SEO 元信息、404 页，并把容器纳入 compose 管理。

| 项目     | 值                                                                        |
| -------- | ------------------------------------------------------------------------- |
| 备份     | `/srv/suanzhun/backups/20260917-194249`                                   |
| 变更文件 | 11 个上线文件；新增 favicon / apple-touch-icon / og-image / 404.html 等   |
| 基础设施 | 容器改由 `docker compose` 管理，容器名仍为 `suanzhun-web`                 |
| 发布后   | 11 个文件哈希复核一致，10 个地址全部 200，375/1280px 无溢出、无控制台报错 |

### 2026-09-17 0.4.1 缓存归属修正

线上发现 Caddy 与 Nginx 同时设置 `Cache-Control`，同一条响应出现两个冲突的头
（JS/CSS 被标成 7 天缓存，又被标成 `no-cache`）。修正为缓存只在 Nginx 一处声明。

| 项目       | 值                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Caddy 备份 | `/srv/kidswear-data/staging/deeptutor-public-20260804-ui-hardening-01/deploy/public/Caddyfile.bak-20260917-cache-owner`                  |
| 改动       | 从 `suanzhun.cauai.fun` 块删除 `@html` / `@staticAssets` 两条 Cache-Control 规则，仅保留安全头与反代                                     |
| 仓库改动   | `deploy/nginx.conf` 收敛缓存规则，HTML/JS/CSS 为 `no-cache`，图片与字体为 7 天                                                           |
| 验证       | `caddy validate` 与 `caddy reload` 通过；`/bazi.js`、`/` 为单条 `no-cache`，`/og-image.png` 为单条 `public, max-age=604800`，gzip 仍生效 |

### 2026-09-18 0.5.0 工程闸门与无障碍修复

补齐推送前密钥扫描、本地预览测试、文档索引与无障碍关联。

| 项目     | 值                                                                                    |
| -------- | ------------------------------------------------------------------------------------- |
| 备份     | `/srv/suanzhun/backups/20260918-001526`                                               |
| 变更文件 | `paipan.html`（其余 10 个文件哈希一致，未上传）                                       |
| 改动     | 排盘页 13 个表单控件补 `for` 关联；本地预览复刻线上缓存与 404；新增密钥扫描与文档索引 |
| 发布前   | `npm run release:check` 通过：lint + 格式 + 密钥扫描 + 23 项契约 + 27 项测试          |
| 发布后   | 13/13 控件有可读名称；375/1280px 无溢出、无控制台报错；实际排盘输出 1737 字           |
| 复核     | `/` 与 `/paipan.html` 单条 `no-cache`；未知地址 404 且渲染自定义页                    |

### 2026-09-18 0.6.0 结果页文字对比度达标

真实浏览器实测排盘结果页有 24 处 WCAG AA 不达标，最严重处仅 1.26:1（八宅「伏位/六煞/祸害」落到深底深字、五行原色直接当文字色）。本轮修正配色令牌并新增 CI 对比度闸门。

| 项目     | 值                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| 备份     | `/srv/suanzhun/backups/20260918-024606`                                                                     |
| 变更文件 | `index.html` `paipan.html` `404.html` `app.js`（其余 7 个文件哈希一致，未上传）                             |
| 改动     | `--dim2` 提亮；新增浅底 `-ink` 与深底 `-on-dark` 两族令牌；`jClass()` 修正「小吉/偏凶」映射；新增对比度闸门 |
| 发布前   | `npm run release:check` 通过：lint + 格式 + 密钥扫描 + 26 项契约 + 对比度契约 + 27 项测试                   |
| 发布后   | 三页 × 1280/375 实测 `overflow=0 contrastFails=0 consoleErrors=0`；渐变大字逐像素采样最差 5.60:1            |
| 复核     | 11 个文件哈希复核一致，10 个地址全部 200；八宅/五行/大运标签清晰可读                                        |

### 2026-09-18 0.7.0 CSP 与输入转义

线上响应头一直缺 `Content-Security-Policy`。排查时发现更严重的问题：姓名会直接拼进
`innerHTML`，真实浏览器里填 `<img src=x onerror="window.__xss=1">` 会真的执行。本轮
修复该 DOM-XSS、补上 CSP，并把排盘页输入控件升到 44px 触控目标。

| 项目     | 值                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| 备份     | `/srv/suanzhun/backups/20260918-032755`                                                                         |
| 变更文件 | `paipan.html` `app.js`（其余 9 个文件哈希一致，未上传）                                                         |
| 基础设施 | `nginx.conf` 用 `set $csp` + 每个缓存 location 各写一份 `add_header`（`add_header` 不继承）                     |
| 改动     | 新增 `esc()` 转义用户输入；Nginx 与本地预览同源 CSP；输入控件 `min-height:44px`；新增 ADR 0004                  |
| 发布前   | `npm run release:check` 通过：lint + 格式 + 密钥扫描 + 27 项契约 + 对比度契约 + 29 项测试                       |
| 发布后   | 线上 10 个地址（含 404）CSP 逐字匹配配置；浏览器实测 XSS 已阻断、0 CSP 违规、0 报错；375px 下 `under44=0`       |
| 复核     | 5 种 XSS payload × 主盘/合婚盘全部 safe；4 项闸门反向验证全部 CAUGHT（删 CSP/制造漂移/删 esc 用法/删 esc 函数） |
