# 🐯 dsh-pet-shura — 修罗小脑斧

为 DeepSeek Harness（DSH）网页界面打造的动画桌宠插件：纯白翼甲守护虎，金色轻甲、红色翼甲、绿色灵核与小虎牙——把代码守护、错误预警、证据复核和安全门禁化为本能。

宠物形象由 Codex `hatch-pet` 技能产出（v2 精灵表 1536×2288，8 列 × 11 行，单元 192×208）。插件为零依赖 host 插件：通过 `tapIndex` 向 `index.html` 注入一段自包含页面脚本，并用独立路由提供精灵表。不触碰任何模型流量。

## 安装

```bash
dsh plugin --profile web add "github:brittanistrehlowll-oss/dsh-pet-shura"
# 重启 dsh web，刷新页面——右下角出现修罗小脑斧
```

## 卸载

```bash
dsh plugin --profile web remove dsh-pet-shura
# 重启 dsh web
```

## 功能

| 功能 | 说明 |
|---|---|
| 说话气泡 | 通过 SSE（`/pet/events`）实时汇报工作进度：`正在跑终端命令…`、`✅ 写文件完成`、`⚠️ …出错了`、`需要你拍板`、`回答完毕`——Codex 风格头顶气泡 |
| 完整动画 | 11 行 v2 状态：呼吸 idle、左右踱步、挥手、跳跃、打滚、等待、忙碌、检查，外加 16 方向 look 循环 |
| 看向鼠标 | 鼠标靠近（240px 半径）时用 16 方向帧追随你 |
| 拖拽移动 | 位置记住在 `localStorage['dsh.pet.pos']` |
| 随机卖萌 | 每 7–16 秒随机挥手/跳跃/打滚/踱步；闲置 22 秒转等待姿态 |
| 设置面板 | 右键宠物 → ⚙️ 设置：大小（60/75/100%）、随机动作、看向鼠标、重置位置——存于 `localStorage['dsh.pet.settings']` |
| 右键菜单 | 宠物简介 · 休息（隐藏，🐯 按钮召回）· 设置 |
| 安全失败 | 精灵表不可用时脚本自动移除，绝不影响宿主页面 |

## 开发

```
dsh-pet-shura/
├── package.json          dsh.bundle.patch → cordis.patch.yml
├── cordis.patch.yml      挂载 pet-shura 行的 profile patch
├── lib/
│   ├── index.js          host 插件：精灵表路由 + index 注入
│   └── pet-client.js     自包含浏览器脚本（IIFE，无依赖）
├── assets/
│   └── spritesheet.webp  v2 宠物精灵表（1536×2288）
├── README.md / README.zh.md
└── LICENSE               MIT
```

日常只改 `lib/pet-client.js`（浏览器端脚本），由 `tapIndex` 内联进 `index.html`，改完提交即可——无需构建步骤。

## 致谢

宠物形象：2026-08-10 用 Codex `hatch-pet` 技能为 wx 孵化。
DSH 插件：`dsh-pet-shura`。
