# 算的准

传统命理文化参考工具，提供真太阳时、四柱八字、五行旺衰、大运流年、八宅命卦、姓名五格与合婚参考。

## 当前形态

这是一个无构建步骤的静态 Web 项目，由 Nginx 提供服务。计算逻辑运行在浏览器端，`bazi.js` 负责排盘，`analysis.js` 负责分析，`app.js` 负责表单和结果渲染。

## 本地运行

需要 Node.js 20+。静态预览可使用任意静态服务器，例如：

```powershell
npm install
npm run serve
```

默认地址为 <http://localhost:4173/>，可用 `PORT` 环境变量改端口。不需要前端框架或数据库。

## 质量检查

```powershell
npm run lint           # ESLint
npm run format:check   # Prettier 校验
npm run secret-scan    # 明文凭据扫描
npm run check          # 结构与契约校验
npm test               # 排盘引擎回归测试
npm run release:check  # 以上全部串行执行
```

`npm run check` 目前包含 54 项契约：核心文件存在、脚本语法、页面脚本引用、SEO 元信息、
无障碍（控件可读名称、键盘焦点环、结果区播报与聚焦、语言、标题层级）、缓存策略在 Nginx
与本地预览之间一致、gzip 与 404 兜底、首屏与脚本的 gzip 体积预算、Node 版本一致性，
以及文档索引与 ADR 登记一致性。

文档导航见 [docs/INDEX.md](docs/INDEX.md)，历史决策见 [docs/adr/](docs/adr/)。

## 站点资源

```powershell
npm run assets   # 重新生成 favicon.svg / apple-touch-icon.png / og-image.png
```

图标与分享卡片由 `scripts/build-assets.mjs` 生成，产物已提交进仓库；只有调整品牌视觉时才需要重跑。
同一条命令还会产出 `favicon.ico`（16/32/48）、`assets/icon-192.png`、`assets/icon-512.png`、
maskable 两个尺寸与 `site.webmanifest`，三个页面统一引用，手机可「添加到主屏幕」。

## 发布

```powershell
npm run deploy -- --dry-run   # 预览差异，不写入
npm run deploy                # 正式发布
```

发布脚本会依次执行质量门、远端备份、差异上传、哈希复核与线上探活，细节见 [docs/RELEASE-RUNBOOK.md](docs/RELEASE-RUNBOOK.md)。

检查内容包括：核心文件存在、JavaScript 语法、页面脚本引用、关键入口、响应式与减少动效标记、排盘真值与合婚输出边界。

HTML 页面为手工排版，已在 `.prettierignore` 中排除，避免格式化破坏既有布局。

本地预览 `npm run serve` 复刻线上的缓存与 404 行为，因此本地看到的现象与线上一致，
这两处的一致性由 `npm run check` 锁死。

## 文件约定

```text
index.html       首页与服务说明
paipan.html      排盘输入与结果页面
404.html         找不到页面时的兜底页
app.js           表单、状态和结果渲染
bazi.js          历法与四柱计算
analysis.js      五行、八宅、姓名和合婚分析
scripts/         本地质量与发布前检查
tests/           无网络的回归测试
tests/helpers/   在 Node 中加载浏览器端 UMD 模块的测试夹具
docs/            PRD、架构、发布和审计文档
deploy/          服务器上的 Nginx 与 Compose 定义
```

## 产品边界

结果仅作传统文化参考与自我反思，不构成医疗、法律、投资或其他专业建议。不得添加确定性恐吓、虚构案例、虚构命中率或未经确认的商业承诺。

## 正式环境

- 域名：<https://suanzhun.cauai.fun>
- 服务目录：`/srv/suanzhun/public`
- Web 容器：`suanzhun-web`
- 基础设施：`/srv/suanzhun/nginx.conf` 与 `/srv/suanzhun/docker-compose.yml`，由仓库 `deploy/` 同步
- 发布前必须保留远端备份，并完成 `npm run release:check`。

## 许可

私有项目，版权归权利人所有，未经书面许可不得复制、商用或再发布。详见 [LICENSE](LICENSE)。
