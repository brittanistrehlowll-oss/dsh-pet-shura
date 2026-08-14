# 🐯 dsh-pet-shura — 修罗小脑斧

An animated desktop pet for the DeepSeek Harness (DSH) web surface. A white
winged-armor guardian tiger with gold light armor, red wing armor, a green
spirit core and tiny fangs — hatching code-guarding, error-warning,
evidence-review and safety-gate instincts.

Built from a [hatch-pet](https://github.com/deepseek-ai/deepseek-harness)
v2 spritesheet (1536×2288, 8 cols × 11 rows, 192×208 cells) with a
zero-dependency host plugin: it taps the served `index.html` and injects one
self-contained page script, plus serves the spritesheet over a dedicated
route. Nothing touches your model traffic.

## Install

```bash
dsh plugin --profile web add "github:brittanistrehlowll-oss/dsh-pet-shura"
# restart dsh web, then refresh the page — the pet appears bottom-right
```

## Uninstall

```bash
dsh plugin --profile web remove dsh-pet-shura
# restart dsh web
```

## Features

| Feature | Detail |
|---|---|
| Full animation | All 11 v2 rows: idle breathing, running left/right, waving, jumping, failed, waiting, task-running, review, plus 16-direction look loop |
| Look-at-mouse | Tracks your cursor with 16 direction frames (240px radius) |
| Drag & drop | Position remembered in `localStorage['dsh.pet.pos']` |
| Random actions | Waves / jumps / tumbles / paces every 7–16 s; waiting pose after 22 s idle |
| Settings panel | Right-click the pet → ⚙️ 设置: size (60/75/100%), random actions, look-at-mouse, reset position — persisted in `localStorage['dsh.pet.settings']` |
| Right-click menu | Pet info · rest (hide, recall via 🐯 button) · settings |
| Safe failure | Script removes itself when the spritesheet is unavailable; never disturbs the host page |

## Development

```
dsh-pet-shura/
├── package.json          dsh.bundle.patch → cordis.patch.yml
├── cordis.patch.yml      profile patch: mounts the pet-shura row
├── lib/
│   ├── index.js          host plugin: spritesheet route + index tap
│   └── pet-client.js     self-contained browser script (IIFE, no deps)
├── assets/
│   └── spritesheet.webp  v2 pet atlas (1536×2288)
├── README.md / README.zh.md
└── LICENSE               MIT
```

`lib/pet-client.js` is the only file you usually edit. It is inlined into
`index.html` by `tapIndex`, so a change is a commit away — no build step.

## Credits

Pet art: hatched 2026-08-10 with the Codex `hatch-pet` skill for wx.
DSH pet plugin: `dsh-pet-shura`.
