# 技术架构

## 分层

```text
页面层       index.html / paipan.html
交互层       app.js
领域计算层   bazi.js / analysis.js
质量层       scripts/verify.mjs / tests/
部署层       Nginx 静态目录 /srv/suanzhun/public
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
