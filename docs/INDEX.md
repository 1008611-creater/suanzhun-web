# docs/INDEX.md —— 文档索引与上下文装载

按任务读取最小必要上下文，不要一上来读整个仓库。

## 固定上下文包

```text
README.md
+ docs/INDEX.md（本文件）
+ 目标模块文档（见下表）
+ 当前任务 / 规格
+ 验收标准（docs/PRD.md 的验收标准一节）
```

## 按任务读什么

| 我要做的事           | 必读                                              | 选读                        |
| -------------------- | ------------------------------------------------- | --------------------------- |
| 改排盘或分析算法     | `docs/TECHNICAL-DESIGN.md`、`tests/bazi.test.mjs` | `bazi.js`、`analysis.js`    |
| 改页面视觉或交互     | `DESIGN.md`、`docs/PRD.md`                        | `index.html`、`paipan.html` |
| 改发布流程或基础设施 | `docs/RELEASE-RUNBOOK.md`                         | `deploy/`                   |
| 看质量门与闸门       | `CONTRIBUTING.md`、`scripts/verify.mjs`           | `.github/workflows/ci.yml`  |
| 查历史决策           | `docs/adr/`                                       | `CHANGELOG.md`              |

## 文档清单

| 文件                                              | 作用                                                 |
| ------------------------------------------------- | ---------------------------------------------------- |
| `PRD.md`                                          | 产品定位、用户路径、1.0 范围与验收标准               |
| `TECHNICAL-DESIGN.md`                             | 工作栈选择、视觉系统与工程规则                       |
| `DESIGN.md`                                       | 设计令牌、排版、间距、动效与无障碍约定（仓库根目录） |
| `RELEASE-RUNBOOK.md`                              | 发布、参数、人工确认与回滚，含发布记录               |
| `IMPECCABLE-AUDIT.md`                             | 前端质量审计记录                                     |
| `adr/0001-cache-headers-single-owner.md`          | 缓存响应头只允许一个归属                             |
| `adr/0002-secret-scan-before-push.md`             | 推送前必须通过密钥扫描                               |
| `adr/0003-result-contrast-token-contract.md`      | 结果页文字对比度由令牌契约锁定                       |
| `adr/0004-csp-single-owner-and-input-escaping.md` | CSP 单归属与用户输入转义                             |
| `adr/0005-liunian-window-and-result-next-step.md` | 流年窗口跟随当前年份与结果页转化收尾                 |
| `adr/0006-action-advice-engine.md`                | 行动建议引擎：事业、婚姻、八宅落地与姓名优选         |
| `adr/README.md`                                   | ADR 编号与只增不改约定                               |

## 权威来源（不要重复维护）

| 事实                 | 唯一权威                                                  |
| -------------------- | --------------------------------------------------------- |
| 线上地址与文件清单   | `scripts/deploy.mjs` 的 `FILES` 常量                      |
| 缓存与 404 策略      | `deploy/nginx.conf`                                       |
| 安全响应头（含 CSP） | `deploy/nginx.conf` 与 `scripts/serve.mjs` 的 `CSP` 常量  |
| 质量门包含哪些检查   | `scripts/verify.mjs` 与 `package.json` 的 `release:check` |
| 版本与变更           | `package.json` 与 `CHANGELOG.md`                          |

_建立：2026-09-17_
