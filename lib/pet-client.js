/**
 * 修罗小脑斧 (shura-sentinel) — DSH 网页桌宠
 * 迁移自 Codex hatch-pet 产物：C:\Users\wx\.codex\pets\shura-sentinel
 * （Codex 原名「守衡修罗」，DSH 侧昵称「修罗小脑斧」）
 *
 * v2 精灵表契约：1536x2288，8 列 x 11 行，单元 192x208
 *   行 0  idle          帧0-5  [280,110,110,140,140,320]
 *   行 1  running-right 帧0-7  120 each, 末帧 220
 *   行 2  running-left  帧0-7  120 each, 末帧 220
 *   行 3  waving        帧0-3  140 each, 末帧 280
 *   行 4  jumping       帧0-4  140 each, 末帧 280
 *   行 5  failed        帧0-7  140 each, 末帧 240
 *   行 6  waiting       帧0-5  150 each, 末帧 260
 *   行 7  running       帧0-5  120 each, 末帧 220
 *   行 8  review        帧0-5  150 each, 末帧 280
 *   行 9  look A        帧0-7  000,022.5,...,157.5（屏幕上方为 000，顺时针）
 *   行 10 look B        帧0-7  180,202.5,...,337.5
 *
 * 纯 vanilla JS，无依赖；加载失败时静默退出，不影响宿主页面。
 */
(() => {
  'use strict';
  // 去重保护：插件注入与旧版 dist 注入并存时只渲染一个
  if (window.__shuraPetLoaded || document.getElementById('dsh-pet-root')) return;
  window.__shuraPetLoaded = true;

  const PET = {
    id: 'shura-sentinel',
    displayName: '修罗小脑斧',
    description:
      '一只把代码守护、错误预警、证据复核和安全门禁化为本能的纯白翼甲守护虎；金色轻甲、红色翼甲、绿色灵核与小虎牙是它的识别特征。',
    sheet: '/pet/shura-sentinel.webp',
  };

  const CELL_W = 192;
  const CELL_H = 208;
  const SHEET_COLS = 8;
  const LOOK_RADIUS_BASE = 240; // 鼠标进入该半径内才看向它（随缩放等比调整）

  // ── 设置（localStorage 持久化；右键宠物 → ⚙️ 设置 可调） ─────
  const SETTINGS_KEY = 'dsh.pet.settings';
  const DEFAULT_SETTINGS = { scale: 0.75, randomActions: true, lookAtMouse: true };
  let settings = loadSettings();
  let W = Math.round(CELL_W * settings.scale);
  let H = Math.round(CELL_H * settings.scale);
  let LOOK_RADIUS = Math.round(LOOK_RADIUS_BASE * settings.scale / DEFAULT_SETTINGS.scale);

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    } catch { /* ignore */ }
    return Object.assign({}, DEFAULT_SETTINGS);
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }

  // 行定义：{ row, frames, durations, loop }
  const ROWS = {
    idle: { row: 0, frames: [0, 1, 2, 3, 4, 5], durations: [280, 110, 110, 140, 140, 320], loop: true },
    'running-right': { row: 1, frames: [0, 1, 2, 3, 4, 5, 6, 7], durations: [120, 120, 120, 120, 120, 120, 120, 220], loop: true },
    'running-left': { row: 2, frames: [0, 1, 2, 3, 4, 5, 6, 7], durations: [120, 120, 120, 120, 120, 120, 120, 220], loop: true },
    waving: { row: 3, frames: [0, 1, 2, 3], durations: [140, 140, 140, 280], loop: false },
    jumping: { row: 4, frames: [0, 1, 2, 3, 4], durations: [140, 140, 140, 140, 280], loop: false },
    failed: { row: 5, frames: [0, 1, 2, 3, 4, 5, 6, 7], durations: [140, 140, 140, 140, 140, 140, 140, 240], loop: false },
    waiting: { row: 6, frames: [0, 1, 2, 3, 4, 5], durations: [150, 150, 150, 150, 150, 260], loop: true },
    running: { row: 7, frames: [0, 1, 2, 3, 4, 5], durations: [120, 120, 120, 120, 120, 220], loop: true },
    review: { row: 8, frames: [0, 1, 2, 3, 4, 5], durations: [150, 150, 150, 150, 150, 280], loop: false },
  };

  // ── 容器与画布 ──────────────────────────────────────────────
  const root = document.createElement('div');
  root.id = 'dsh-pet-root';
  root.style.cssText = [
    'position:fixed',
    'z-index:2147483000',
    'width:' + W + 'px',
    'height:' + H + 'px',
    'cursor:grab',
    'user-select:none',
    '-webkit-user-select:none',
    'touch-action:none',
    'pointer-events:auto',
  ].join(';');

  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  root.appendChild(canvas);

  // 名称标签（跟随主题的胶囊，风格对齐 DSH 额度卡片）
  const bubble = document.createElement('div');
  bubble.textContent = PET.displayName;
  bubble.style.cssText = [
    'position:absolute',
    'left:50%',
    'top:-26px',
    'transform:translateX(-50%)',
    'padding:2px 10px',
    'border-radius:999px',
    'font-size:11px',
    'line-height:1.4',
    'white-space:nowrap',
    'font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif)',
    'color:var(--dsw-alias-label-secondary,#61666b)',
    'background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.06))',
    'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06))',
    'pointer-events:none',
    'opacity:0',
    'transition:opacity .18s ease',
  ].join(';');
  root.appendChild(bubble);

  // ── 说话气泡（宽扁通知条：放宽宽度让文字尽量单行排开，压缩高度成扁平条） ──
  // max-width ~240px，line-height/padding 压扁；超长文字才换行，短句是矮宽横条。
  const speech = document.createElement('div');
  speech.id = 'dsh-pet-speech';
  speech.style.cssText = [
    'position:absolute',
    'left:50%',
    'top:-74px',
    'transform:translateX(-50%)',
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'max-width:240px',
    'box-sizing:border-box',
    'padding:5px 13px',
    'border-radius:12px',
    'font-size:12.5px',
    'line-height:1.35',
    'text-align:center',
    'white-space:normal',
    'font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif)',
    'color:var(--dsw-alias-label-primary,#1b1b1c)',
    'background:var(--dsw-alias-bg-layer-2,#fff)',
    'border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1))',
    'box-shadow:var(--dsw-shadow-lv3,0 8px 26px rgba(15,17,21,.1),0 2px 6px rgba(15,17,21,.06))',
    'pointer-events:none',
    'opacity:0',
    'transition:opacity .18s ease',
  ].join(';');
  const speechTail = document.createElement('div');
  speechTail.style.cssText = [
    'position:absolute',
    'left:50%',
    'bottom:-5px',
    'width:11px',
    'height:11px',
    'transform:translateX(-50%) rotate(45deg)',
    'background:var(--dsw-alias-bg-layer-2,#fff)',
    'border-bottom:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1))',
    'border-right:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1))',
  ].join(';');
  speech.appendChild(speechTail);
  root.appendChild(speech);

  let speechHideTimer = null;
  let actionAt = 0;
  function say(text, ms) {
    if (!text) return;
    speech.textContent = text;
    speech.style.opacity = '1';
    clearTimeout(speechHideTimer);
    speechHideTimer = setTimeout(() => {
      speech.style.opacity = '0';
    }, ms || 4200);
  }
  /** 事件驱动的动作联动（带节流，避免高频工具事件打断动画）。 */
  function react(kind) {
    const now = performance.now();
    if (now - actionAt < 700) return;
    actionAt = now;
    switch (kind) {
      case 'tool':
      case 'work': setAnim('running'); break;
      case 'done': setAnim('waving'); break;
      case 'error': setAnim('failed'); break;
      case 'user': setAnim('jumping'); break;
      case 'reply': setAnim('review'); break;
      case 'ask': setAnim('waiting'); break;
      default: break;
    }
  }

  // ── 工作进度事件流（SSE，随页面自动重连） ────────────────────
  try {
    const es = new EventSource('/pet/events');
    es.onmessage = (e) => {
      try {
        const brief = JSON.parse(e.data);
        if (brief && brief.text) {
          if (brief.kind === 'overview') {
            // 线程概况：显示久一点，不打断当前动画
            say(brief.text, 6500);
          } else {
            say(brief.text, brief.kind === 'error' ? 6000 : 4200);
            react(brief.kind);
          }
        }
      } catch { /* ignore */ }
    };
    // onerror 时 EventSource 自动重连，无需处理
  } catch { /* ignore */ }

  // ── 闲时台词（没有工作事件时偶尔自言自语） ────────────────────
  const IDLE_LINES = [
    '守护中…',
    '随时待命',
    '盯紧每一行代码',
    '一切正常，放心干',
    '我在这看着呢',
    '代码安全，有我',
    '今天也是元气满满的小脑斧',
  ];
  function pickIdleLine() {
    return IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)];
  }

  // 召回按钮（隐藏宠物后出现）
  const recall = document.createElement('div');
  recall.textContent = '🐯';
  recall.title = '把修罗小脑斧叫回来';
  recall.style.cssText = [
    'position:fixed',
    'right:20px',
    'bottom:20px',
    'z-index:2147483001',
    'width:30px',
    'height:30px',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-size:16px',
    'border-radius:50%',
    'cursor:pointer',
    'background:rgba(20,24,34,.75)',
    'border:1px solid rgba(255,255,255,.2)',
    'box-shadow:0 2px 8px rgba(0,0,0,.35)',
    'opacity:0',
    'pointer-events:none',
    'transition:opacity .18s ease',
  ].join(';');
  recall.addEventListener('pointerdown', (e) => e.stopPropagation());

  // ── 状态 ────────────────────────────────────────────────────
  const state = {
    anim: 'idle',
    t0: 0,
    pos: null, // {x, y} 拖拽后的绝对位置；null = 默认右下角
    hidden: false,
    dragging: false,
    dragMoved: false,
    mouse: null, // {x, y} 视口坐标
    nextActionAt: 0,
    nextIdleLineAt: 0,
    idleSince: 0,
  };

  function savePos() {
    try {
      localStorage.setItem('dsh.pet.pos', JSON.stringify(state.pos));
    } catch { /* ignore */ }
  }
  function loadPos() {
    try {
      const raw = localStorage.getItem('dsh.pet.pos');
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.x === 'number' && typeof p.y === 'number') state.pos = p;
      }
    } catch { /* ignore */ }
  }

  function applyPosition() {
    if (state.pos) {
      root.style.left = state.pos.x + 'px';
      root.style.top = state.pos.y + 'px';
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    } else {
      root.style.left = 'auto';
      root.style.top = 'auto';
      root.style.right = '24px';
      root.style.bottom = '24px';
    }
  }

  function setAnim(name) {
    if (state.anim === name) return;
    state.anim = name;
    state.t0 = performance.now();
  }

  // ── 动画帧 ──────────────────────────────────────────────────
  function frameIndex(anim, elapsed) {
    const def = ROWS[anim];
    if (!def) return 0;
    let acc = 0;
    for (let i = 0; i < def.frames.length; i++) {
      const dur = def.durations[i] || 120;
      if (elapsed < acc + dur) return i;
      acc += dur;
    }
    return def.loop ? 0 : def.frames.length - 1;
  }

  function animFinished(anim, elapsed) {
    const def = ROWS[anim];
    if (!def || def.loop) return false;
    return elapsed >= def.durations.reduce((a, b) => a + b, 0);
  }

  // look 帧映射：屏幕坐标角 → 16 方向（000=上，顺时针）
  function lookFrame(mx, my) {
    const rect = root.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = mx - cx;
    const dy = my - cy;
    if (Math.abs(dx) < 26 && dy > 70) return null; // 正前方死区 → 保持 idle
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const idx = Math.round(((deg + 90 + 360) % 360) / 22.5) % 16;
    return idx < 8 ? { row: 9, frame: idx } : { row: 10, frame: idx - 8 };
  }

  function draw(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let srcRow = ROWS[state.anim].row;
    let srcFrame = frameIndex(state.anim, now - state.t0);

    // 鼠标接近时优先 look（受"看向鼠标"设置开关控制）
    if (settings.lookAtMouse && state.mouse && !state.dragging && (state.anim === 'idle' || state.anim === 'waiting')) {
      const rect = root.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(state.mouse.x - cx, state.mouse.y - cy);
      if (dist < LOOK_RADIUS) {
        const lf = lookFrame(state.mouse.x, state.mouse.y);
        if (lf) {
          srcRow = lf.row;
          srcFrame = lf.frame;
        }
      }
    }

    const sx = srcFrame * CELL_W;
    const sy = srcRow * CELL_H;
    ctx.drawImage(sheet, sx, sy, CELL_W, CELL_H, 0, 0, canvas.width, canvas.height);
  }

  // ── 行为调度 ────────────────────────────────────────────────
  function randomAction() {
    const r = Math.random();
    if (r < 0.34) setAnim('waving');
    else if (r < 0.5) setAnim('jumping');
    else if (r < 0.68) setAnim(Math.random() < 0.5 ? 'running-left' : 'running-right');
    else if (r < 0.8) setAnim('failed');
    else if (r < 0.92) setAnim('review');
    // else 保持 idle
  }

  function scheduleNext() {
    state.nextActionAt = performance.now() + 7000 + Math.random() * 9000;
  }

  function tick(now) {
    // 一次性动作播完回 idle
    const def = ROWS[state.anim];
    if (def && !def.loop && animFinished(state.anim, now - state.t0)) {
      setAnim('idle');
      state.idleSince = now;
      scheduleNext();
    }

    // idle 状态随机行为 + 闲置等待（受"随机动作"设置开关控制）
    if (state.anim === 'idle') {
      if (settings.randomActions && now - state.idleSince > 22000) {
        setAnim('waiting');
        say('等你呢，我守着…', 3000);
      } else if (settings.randomActions && now >= state.nextActionAt) {
        randomAction();
      } else if (now >= state.nextIdleLineAt) {
        // 无工作事件时的闲时台词（45–90 秒一条）
        state.nextIdleLineAt = now + 45000 + Math.random() * 45000;
        say(pickIdleLine(), 3000);
      }
    }
    if (state.anim === 'waiting') {
      if (now - state.t0 > 2600 * 2) setAnim('idle');
    }

    // 踱步位移
    if (state.anim === 'running-right' || state.anim === 'running-left') {
      const dir = state.anim === 'running-right' ? 1 : -1;
      const rect = root.getBoundingClientRect();
      const nx = rect.left + dir * 0.7;
      const minX = 8;
      const maxX = Math.max(minX + 1, window.innerWidth - W - 8);
      const clamped = Math.min(Math.max(nx, minX), maxX);
      if (!state.pos) state.pos = { x: rect.left, y: rect.top };
      state.pos.x = clamped;
      state.pos.y = rect.top;
      applyPosition();
      savePos();
      if (now - state.t0 > 2400) setAnim('idle');
    }
  }

  // ── 交互 ────────────────────────────────────────────────────
  let downAt = null;
  let downX = 0;
  let downY = 0;
  let startPos = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (state.hidden) return;
    downAt = performance.now();
    downX = e.clientX;
    downY = e.clientY;
    const rect = root.getBoundingClientRect();
    startPos = { x: rect.left, y: rect.top };
    state.dragging = true;
    state.dragMoved = false;
    root.style.cursor = 'grabbing';
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    state.mouse = { x: e.clientX, y: e.clientY };
    if (!state.dragging) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (Math.abs(dx) + Math.abs(dy) > 4) state.dragMoved = true;
    if (state.dragMoved && startPos) {
      const nx = Math.min(Math.max(startPos.x + dx, 8), window.innerWidth - W - 8);
      const ny = Math.min(Math.max(startPos.y + dy, 8), window.innerHeight - H - 8);
      state.pos = { x: nx, y: ny };
      applyPosition();
    }
  });

  function endDrag(e) {
    if (!state.dragging) return;
    state.dragging = false;
    root.style.cursor = 'grab';
    if (!state.dragMoved) {
      // 单击 → 跳跃
      setAnim('jumping');
      state.idleSince = performance.now();
      scheduleNext();
    } else {
      savePos();
    }
  }
  canvas.addEventListener('pointerup', endDrag);  canvas.addEventListener('pointercancel', endDrag);

  window.addEventListener('pointermove', (e) => {
    state.mouse = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointerleave', () => {
    state.mouse = null;
  });

  canvas.addEventListener('mouseenter', () => {
    bubble.style.opacity = '1';
  });
  canvas.addEventListener('mouseleave', () => {
    bubble.style.opacity = '0';
  });

  // 右键菜单
  const menu = document.createElement('div');
  menu.style.cssText = [
    'position:absolute',
    'left:50%',
    'top:' + (H + 6) + 'px',
    'transform:translateX(-50%)',
    'z-index:2147483002',
    'min-width:150px',
    'padding:6px',
    'border-radius:10px',
    'font-size:12px',
    'color:#e8ecf4',
    'background:rgba(24,29,42,.96)',
    'border:1px solid rgba(255,255,255,.14)',
    'box-shadow:0 6px 20px rgba(0,0,0,.4)',
    'display:none',
  ].join(';');

  const menuTitle = document.createElement('div');
  menuTitle.textContent = PET.displayName + ' · 守护虎';
  menuTitle.style.cssText = 'padding:4px 8px;font-weight:600;opacity:.85';
  menu.appendChild(menuTitle);

  const menuDesc = document.createElement('div');
  menuDesc.textContent = PET.description;
  menuDesc.style.cssText = 'padding:2px 8px 8px;opacity:.6;line-height:1.45';
  menu.appendChild(menuDesc);

  const hideItem = document.createElement('div');
  hideItem.textContent = '🙈 让它休息一下';
  hideItem.style.cssText = 'padding:6px 8px;border-radius:6px;cursor:pointer';
  hideItem.addEventListener('mouseenter', () => { hideItem.style.background = 'rgba(255,255,255,.1)'; });
  hideItem.addEventListener('mouseleave', () => { hideItem.style.background = 'transparent'; });
  hideItem.addEventListener('click', () => hidePet());
  menu.appendChild(hideItem);

  const settingsItem = document.createElement('div');
  settingsItem.textContent = '⚙️ 设置';
  settingsItem.style.cssText = 'padding:6px 8px;border-radius:6px;cursor:pointer';
  settingsItem.addEventListener('mouseenter', () => { settingsItem.style.background = 'rgba(255,255,255,.1)'; });
  settingsItem.addEventListener('mouseleave', () => { settingsItem.style.background = 'transparent'; });
  settingsItem.addEventListener('click', () => {
    menu.style.display = 'none';
    openSettings();
  });
  menu.appendChild(settingsItem);
  root.appendChild(menu);

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });
  window.addEventListener('pointerdown', (e) => {
    if (!root.contains(e.target) && !settingsPanel.contains(e.target)) {
      menu.style.display = 'none';
      settingsPanel.style.display = 'none';
    }
  });

  // ── 设置面板（右键 → ⚙️ 设置） ───────────────────────────────
  const settingsPanel = document.createElement('div');
  settingsPanel.id = 'dsh-pet-settings';
  settingsPanel.style.cssText = [
    'position:fixed',
    'left:50%',
    'top:50%',
    'transform:translate(-50%,-50%)',
    'z-index:2147483003',
    'width:300px',
    'padding:14px 16px',
    'border-radius:12px',
    'font-size:13px',
    'color:#e8ecf4',
    'background:rgba(24,29,42,.97)',
    'border:1px solid rgba(255,255,255,.16)',
    'box-shadow:0 10px 32px rgba(0,0,0,.5)',
    'font-family:system-ui,sans-serif',
    'display:none',
  ].join(';');

  const panelTitle = document.createElement('div');
  panelTitle.textContent = PET.displayName + ' · 设置';
  panelTitle.style.cssText = 'font-size:14px;font-weight:600;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.1);margin-bottom:6px';
  settingsPanel.appendChild(panelTitle);

  function panelLabel(text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'opacity:.85';
    return el;
  }
  function panelRow(label, control) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 0';
    row.appendChild(label);
    row.appendChild(control);
    return row;
  }
  function panelButton(text, onClick) {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = [
      'padding:5px 12px',
      'border-radius:7px',
      'font-size:12px',
      'color:#e8ecf4',
      'cursor:pointer',
      'background:rgba(255,255,255,.08)',
      'border:1px solid rgba(255,255,255,.14)',
    ].join(';');
    b.addEventListener('click', onClick);
    return b;
  }

  // 大小：小 / 中 / 大
  const sizeGroup = document.createElement('div');
  sizeGroup.style.cssText = 'display:flex;gap:6px';
  const sizeBtns = [[0.6, '小'], [0.75, '中'], [1.0, '大']].map(([val, label]) => {
    const b = panelButton(label, () => { setScale(val); });
    b.dataset.scale = String(val);
    sizeGroup.appendChild(b);
    return b;
  });
  settingsPanel.appendChild(panelRow(panelLabel('显示大小'), sizeGroup));

  // 随机动作
  const randomCb = document.createElement('input');
  randomCb.type = 'checkbox';
  randomCb.addEventListener('change', () => {
    settings.randomActions = randomCb.checked;
    saveSettings();
  });
  settingsPanel.appendChild(panelRow(panelLabel('随机卖萌（挥手/跳跃/踱步…）'), randomCb));

  // 看向鼠标
  const lookCb = document.createElement('input');
  lookCb.type = 'checkbox';
  lookCb.addEventListener('change', () => {
    settings.lookAtMouse = lookCb.checked;
    saveSettings();
  });
  settingsPanel.appendChild(panelRow(panelLabel('鼠标靠近时看向它'), lookCb));

  // 操作按钮
  const opsRow = document.createElement('div');
  opsRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;padding-top:10px;border-top:1px solid rgba(255,255,255,.1);margin-top:4px';
  opsRow.appendChild(panelButton('↺ 重置位置', resetPos));
  opsRow.appendChild(panelButton('✕ 关闭', () => { settingsPanel.style.display = 'none'; }));
  settingsPanel.appendChild(opsRow);

  function openSettings() {
    renderSettings();
    settingsPanel.style.display = 'block';
  }
  function renderSettings() {
    sizeBtns.forEach((b) => {
      const active = Math.abs(Number(b.dataset.scale) - settings.scale) < 0.001;
      b.style.background = active ? 'rgba(80,120,255,.4)' : 'rgba(255,255,255,.08)';
      b.style.borderColor = active ? 'rgba(150,180,255,.75)' : 'rgba(255,255,255,.14)';
    });
    randomCb.checked = !!settings.randomActions;
    lookCb.checked = !!settings.lookAtMouse;
  }
  function setScale(val) {
    settings.scale = val;
    applyScale();
    renderSettings();
    saveSettings();
  }
  function resetPos() {
    state.pos = null;
    applyPosition();
    savePos();
  }
  function applyScale() {
    W = Math.round(CELL_W * settings.scale);
    H = Math.round(CELL_H * settings.scale);
    LOOK_RADIUS = Math.round(LOOK_RADIUS_BASE * settings.scale / DEFAULT_SETTINGS.scale);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    root.style.width = W + 'px';
    root.style.height = H + 'px';
    menu.style.top = (H + 6) + 'px';
    // 缩放后把宠物保持在视口内
    if (state.pos) {
      state.pos.x = Math.min(state.pos.x, window.innerWidth - W - 8);
      state.pos.y = Math.min(state.pos.y, window.innerHeight - H - 8);
      applyPosition();
      savePos();
    }
    saveSettings();
  }

  function hidePet() {
    state.hidden = true;
    menu.style.display = 'none';
    root.style.display = 'none';
    recall.style.opacity = '1';
    recall.style.pointerEvents = 'auto';
  }
  function showPet() {
    state.hidden = false;
    root.style.display = 'block';
    recall.style.opacity = '0';
    recall.style.pointerEvents = 'none';
  }
  recall.addEventListener('click', showPet);

  // ── 启动 ────────────────────────────────────────────────────
  const sheet = new Image();
  sheet.src = PET.sheet;
  sheet.onerror = () => {
    // 资源不可用则静默退出，不影响宿主页面
    root.remove();
    recall.remove();
  };

  loadPos();
  applyPosition();
  document.body.appendChild(root);
  document.body.appendChild(recall);
  document.body.appendChild(settingsPanel);

  // 等精灵表就绪后开启动画循环
  let started = false;
  function startLoop() {
    if (started) return;
    started = true;
    state.idleSince = performance.now();
    state.nextIdleLineAt = performance.now() + 45000 + Math.random() * 45000;
    scheduleNext();
    // 自检：立即绘制一帧并统计非透明像素（供无头验证）
    try {
      draw(performance.now());
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 8) opaque++;
      root.dataset.petReady = '1';
      root.dataset.petOpaquePixels = String(opaque);
    } catch { /* ignore */ }
    function loop(now) {
      tick(now);
      draw(now);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }
  if (sheet.complete && sheet.naturalWidth > 0) startLoop();
  else sheet.onload = startLoop;
})();

