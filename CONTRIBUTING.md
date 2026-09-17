# 开发规范

## 修改原则

1. 先说明用户路径和验收标准，再修改代码。
2. 计算逻辑与视觉层分开；视觉调整不得改变输入字段、历法算法或结果结构。
3. 不直接编辑正式服务器作为唯一源；先修改工作区副本，检查通过后再发布。
4. 不提交 Cookie、Token、私钥、`.env` 或用户出生资料。

## 提交前检查

```powershell
npm run release:check
```

同时手工检查桌面、375px 手机宽度、表单键盘操作和减少动效模式。

## 发布规则

- 发布统一走 `npm run deploy`，不要手工拼 scp 命令。
- 正式发布前先跑 `npm run deploy -- --dry-run` 确认差异清单。
- 脚本会自动创建 `/srv/suanzhun/backups/<timestamp>` 并只上传哈希不同的文件。
- 发布后仍需在真实浏览器确认视觉与交互；脚本只保证文件与状态码。
- 若视觉或交互明显变差，按 [docs/RELEASE-RUNBOOK.md](docs/RELEASE-RUNBOOK.md) 回滚到对应时间戳备份。
