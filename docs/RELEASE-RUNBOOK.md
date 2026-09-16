# 发布 Runbook

## 发布前

1. 确认变更文件和回滚点。
2. 执行 `npm run release:check`。
3. 确认不包含秘密、Cookie、Token 和真实用户资料。
4. 在服务器创建时间戳备份。

## 发布后

```text
GET /
GET /paipan.html
GET /app.js
GET /analysis.js
GET /bazi.js
```

全部应返回 200。随后在浏览器验证：默认表单可见、开始排盘按钮可用、结果区域出现、刷新后页面可再次输入。

## 回滚

从对应时间戳备份恢复 `index.html`、`paipan.html` 或其他变更文件，随后重复发布后检查。回滚后记录原因，不删除备份。
