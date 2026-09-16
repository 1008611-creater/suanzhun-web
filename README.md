# 算的准

传统命理文化参考工具，提供真太阳时、四柱八字、五行旺衰、大运流年、八宅命卦、姓名五格与合婚参考。

## 当前形态

这是一个无构建步骤的静态 Web 项目，由 Nginx 提供服务。计算逻辑运行在浏览器端，`bazi.js` 负责排盘，`analysis.js` 负责分析，`app.js` 负责表单和结果渲染。

## 本地运行

需要 Node.js 20+。静态预览可使用任意静态服务器，例如：

```powershell
npx serve .
```

不需要安装前端框架或数据库。

## 质量检查

```powershell
npm run check
npm test
npm run release:check
```

检查内容包括：核心文件存在、JavaScript 语法、页面脚本引用、关键入口、响应式与减少动效标记。

## 文件约定

```text
index.html       首页与服务说明
paipan.html      排盘输入与结果页面
app.js           表单、状态和结果渲染
bazi.js          历法与四柱计算
analysis.js      五行、八宅、姓名和合婚分析
scripts/         本地质量与发布前检查
tests/           无网络的回归测试
docs/            PRD、架构、发布和审计文档
```

## 产品边界

结果仅作传统文化参考与自我反思，不构成医疗、法律、投资或其他专业建议。不得添加确定性恐吓、虚构案例、虚构命中率或未经确认的商业承诺。

## 正式环境

- 域名：<https://suanzhun.cauai.fun>
- 服务目录：`/srv/suanzhun/public`
- Web 容器：`suanzhun-web`
- 发布前必须保留远端备份，并完成 `npm run release:check`。
