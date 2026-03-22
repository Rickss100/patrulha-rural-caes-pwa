'use strict';
// ============================================================
// PATRULHA RURAL COM CÃES — Simulação Tática  |  PMES / Canil
// ============================================================

// ── Constantes ───────────────────────────────────────────────
const VWIDTH  = 1100;   // espaço virtual (coordenadas do Python)
const VHEIGHT = 2200;
const T_DUR   = 700;    // duração da transição (ms)
const PI2     = Math.PI * 2;

const C = {
  BLUE:  '#1565C0',
  GREEN: '#00e676',
  RED:   '#ff1744',
  BG:    '#040c08',
  GRID:  '#0a200e',
  GRID2: '#0d2a12',
};

const GROUP_COMANDO = ['CMT','S1','S2','Rast'];
const GROUP_APOIO   = ['AL1','SUB','PR2','PR1'];

// ── Classe Pentagon ──────────────────────────────────────────
class Pentagon {
  constructor(vx, vy, sizes, color, label, inv = false) {
    this.vx    = vx; this.vy = vy;
    this.sizes = Array.isArray(sizes) ? [...sizes] : Array(5).fill(sizes);
    while (this.sizes.length < 5) this.sizes.push(this.sizes[this.sizes.length-1]);
    this.color = color; this.label = label; this.inv = inv;
    this.dir   = 0;
    this.sel   = false;
  }

  pts() {
    const step  = PI2 / 5;
    const start = this.dir - Math.PI/2 + (this.inv ? Math.PI : 0);
    return this.sizes.map((r, i) => ({
      x: this.vx + r * Math.cos(i * step + start),
      y: this.vy + r * Math.sin(i * step + start),
    }));
  }

  hit(wx, wy) {
    const p  = this.pts();
    const xs = p.map(v => v.x), ys = p.map(v => v.y);
    return wx >= Math.min(...xs) && wx <= Math.max(...xs)
        && wy >= Math.min(...ys) && wy <= Math.max(...ys);
  }

  setPos(x, y) { this.vx = x; this.vy = y; }
  move(dx, dy)  { this.vx += dx; this.vy += dy; }
  rotate(a)     { this.dir += a; }

  draw(ctx) {
    const p = this.pts();
    ctx.beginPath();
    p.forEach((v, i) => i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y));
    ctx.closePath();

    // Glow fill
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur  = this.sel ? 20 : 8;
    ctx.fillStyle   = this.color;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = this.sel ? '#ffffff' : 'rgba(0,0,0,0.65)';
    ctx.lineWidth   = this.sel ? 2.5 : 1.2;
    ctx.stroke();

    // Seta de direção
    const tx = this.vx + 34 * Math.cos(this.dir);
    const ty = this.vy + 34 * Math.sin(this.dir);
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth   = 1.8;
    ctx.beginPath(); ctx.moveTo(this.vx, this.vy); ctx.lineTo(tx, ty); ctx.stroke();
    const ha = Math.atan2(ty - this.vy, tx - this.vx);
    const hl = 10;
    [-.4, .4].forEach(off => {
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - hl*Math.cos(ha+off), ty - hl*Math.sin(ha+off));
      ctx.stroke();
    });
    ctx.restore();
  }

  drawLabel(ctx, sc, px, py) {
    const sx = this.vx * sc + px;
    const sy = this.vy * sc + py;
    const fs = Math.min(14, Math.max(9, 12 * sc / 0.35));
    ctx.save();
    ctx.font         = `bold ${fs}px "Courier New", monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#000';
    ctx.fillText(this.label, sx, sy);
    ctx.restore();
  }
}

// ── Estado global ─────────────────────────────────────────────
let objs   = [];      // array de Pentagon (ordem fixa)
let selObj = null;    // objeto selecionado
let grp    = null;    // 'COMANDO'|'APOIO'|null
let panX   = 0, panY = 0;
let sc     = 0.35;
let ptr    = null;    // última posição do ponteiro (world coords)
let dragging = false;
let panning  = false;

// Transição
let inTransition  = false;
let transStart    = 0;
let initPos = [], tgtPos = [];

// ── Referências DOM ───────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx2   = canvas.getContext('2d');

// ── Utilitários de coordenada ─────────────────────────────────
const s2w = (sx, sy) => ({ x: (sx - panX) / sc, y: (sy - panY) / sc });

// ── Resize ────────────────────────────────────────────────────
function resize() {
  const hdr    = document.getElementById('header');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight - hdr.offsetHeight;
  sc = canvas.width / VWIDTH;
}

// ── Cenários (mesma ordem de objetos sempre) ──────────────────
// Ordem: RP3030, RP3031, Rast, S1, S2, CMT, AL1, SUB, PR2, PR1, V1, V2

function makeScene(rows) {
  return rows.map(r => new Pentagon(r[0], r[1], r[2], r[3], r[4], r[5]||false));
}

const dirAll = (list, d) => list.forEach(o => o.dir = d);

function setupEmbarcado() {
  objs = makeScene([
    [150,1400,[120,122,200,200,122],C.BLUE, 'RP3030'],
    [150,1700,[120,122,200,200,122],C.BLUE, 'RP3031'],
    [200,1500,[60,40,40,40,40],C.GREEN,'Rast'],
    [100,1500,[60,40,40,40,40],C.GREEN,'S1'],
    [100,1400,[60,40,40,40,40],C.GREEN,'S2'],
    [200,1400,[60,40,40,40,40],C.GREEN,'CMT'],
    [100,1800,[60,40,40,40,40],C.GREEN,'AL1'],
    [200,1700,[60,40,40,40,40],C.GREEN,'SUB'],
    [200,1800,[60,40,40,40,40],C.GREEN,'PR2'],
    [100,1700,[60,40,40,40,40],C.GREEN,'PR1'],
    [700, 200,[60,40,40,40,40],C.RED,  'V1', true],
    [500, 200,[60,40,40,40,40],C.RED,  'V2', true],
  ]);
}
function setupColuna() {
  objs = makeScene([
    [150,1400,[120,122,200,200,122],C.BLUE, 'RP3030'],
    [150,1700,[120,122,200,200,122],C.BLUE, 'RP3031'],
    [600, 800,[60,40,40,40,40],C.GREEN,'Rast'],
    [600, 900,[60,40,40,40,40],C.GREEN,'S1'],
    [600,1000,[60,40,40,40,40],C.GREEN,'S2'],
    [600,1100,[60,40,40,40,40],C.GREEN,'CMT'],
    [600,1200,[60,40,40,40,40],C.GREEN,'AL1'],
    [600,1300,[60,40,40,40,40],C.GREEN,'SUB'],
    [600,1400,[60,40,40,40,40],C.GREEN,'PR2'],
    [600,1500,[60,40,40,40,40],C.GREEN,'PR1',true],
    [700, 200,[60,40,40,40,40],C.RED,  'V1', true],
    [500, 200,[60,40,40,40,40],C.RED,  'V2', true],
  ]);
}
function setupFrente() {
  objs = makeScene([
    [150,1400,[120,122,200,200,122],C.BLUE, 'RP3030'],
    [150,1700,[120,122,200,200,122],C.BLUE, 'RP3031'],
    [500, 800,[60,40,40,40,40],C.GREEN,'Rast',true],
    [600, 700,[60,40,40,40,40],C.GREEN,'S1'],
    [500, 700,[60,40,40,40,40],C.GREEN,'S2'],
    [400, 700,[60,40,40,40,40],C.GREEN,'CMT'],
    [700, 700,[60,40,40,40,40],C.GREEN,'AL1'],
    [800, 700,[60,40,40,40,40],C.GREEN,'SUB'],
    [900, 700,[60,40,40,40,40],C.GREEN,'PR2'],
    [800, 800,[60,40,40,40,40],C.GREEN,'PR1',true],
    [700, 200,[60,40,40,40,40],C.RED,  'V1', true],
    [500, 200,[60,40,40,40,40],C.RED,  'V2', true],
  ]);
}
function setupEsquerda() {
  objs = makeScene([
    [150,1400,[120,122,200,200,122],C.BLUE, 'RP3030'],
    [150,1700,[120,122,200,200,122],C.BLUE, 'RP3031'],
    [700,1000,[60,40,40,40,40],C.GREEN,'Rast'],
    [600, 900,[60,40,40,40,40],C.GREEN,'S1',  true],
    [600,1000,[60,40,40,40,40],C.GREEN,'S2',  true],
    [600,1100,[60,40,40,40,40],C.GREEN,'CMT', true],
    [600,1200,[60,40,40,40,40],C.GREEN,'AL1', true],
    [600,1300,[60,40,40,40,40],C.GREEN,'SUB', true],
    [600,1400,[60,40,40,40,40],C.GREEN,'PR2', true],
    [700,1300,[60,40,40,40,40],C.GREEN,'PR1'],
    [150,1000,[60,40,40,40,40],C.RED,  'V1'],
    [150,1200,[60,40,40,40,40],C.RED,  'V2'],
  ]);
  dirAll(objs.slice(2), Math.PI/2);
  objs[0].dir = PI2; objs[1].dir = PI2;
}
function setupDireita() {
  objs = makeScene([
    [150, 1400,[120,122,200,200,122],C.BLUE, 'RP3030'],
    [150, 1700,[120,122,200,200,122],C.BLUE, 'RP3031'],
    [500, 1000,[60,40,40,40,40],C.GREEN,'Rast',true],
    [600,  900,[60,40,40,40,40],C.GREEN,'S1'],
    [600, 1000,[60,40,40,40,40],C.GREEN,'S2'],
    [600, 1100,[60,40,40,40,40],C.GREEN,'CMT'],
    [600, 1200,[60,40,40,40,40],C.GREEN,'AL1'],
    [600, 1300,[60,40,40,40,40],C.GREEN,'SUB'],
    [600, 1400,[60,40,40,40,40],C.GREEN,'PR2'],
    [500, 1300,[60,40,40,40,40],C.GREEN,'PR1',true],
    [1000,1000,[60,40,40,40,40],C.RED,  'V1', true],
    [1000,1200,[60,40,40,40,40],C.RED,  'V2', true],
  ]);
  dirAll(objs.slice(2), Math.PI/2);
  objs[0].dir = PI2; objs[1].dir = PI2;
}
function setupRetaguarda() {
  objs = makeScene([
    [150,1400,[120,122,200,200,122],C.BLUE, 'RP3030'],
    [150,1700,[120,122,200,200,122],C.BLUE, 'RP3031'],
    [800,1400,[60,40,40,40,40],C.GREEN,'Rast'],
    [900,1500,[60,40,40,40,40],C.GREEN,'S1', true],
    [800,1500,[60,40,40,40,40],C.GREEN,'S2', true],
    [700,1500,[60,40,40,40,40],C.GREEN,'CMT',true],
    [500,1400,[60,40,40,40,40],C.GREEN,'AL1'],
    [400,1500,[60,40,40,40,40],C.GREEN,'SUB',true],
    [500,1500,[60,40,40,40,40],C.GREEN,'PR2',true],
    [600,1500,[60,40,40,40,40],C.GREEN,'PR1',true],
    [700,2000,[60,40,40,40,40],C.RED,  'V1'],
    [500,2000,[60,40,40,40,40],C.RED,  'V2'],
  ]);
}

const SCENES = {
  'EMBARCADO':       setupEmbarcado,
  'COLUNA':          setupColuna,
  'EMB. FRENTE':     setupFrente,
  'EMB. ESQUERDA':   setupEsquerda,
  'EMB. DIREITA':    setupDireita,
  'EMB. RETAGUARDA': setupRetaguarda,
};

function currentName() {
  for (const [k, fn] of Object.entries(SCENES)) {
    if (fn === activeSetupFn) return k;
  }
  return '';
}
let activeSetupFn = setupEmbarcado;

// ── Transição ────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b-a)*t; }
function ease(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; } // easeInOut

function startTransition(fn) {
  // Guarda posições atuais
  const prev = objs.map(o => ({ x: o.vx, y: o.vy }));

  activeSetupFn = fn;
  fn(); // recria objetos com novas posições

  const count = Math.min(prev.length, objs.length);
  initPos = prev.slice(0, count);
  tgtPos  = objs.slice(0, count).map(o => ({ x: o.vx, y: o.vy }));

  // Reseta objetos para posição inicial da animação
  for (let i = 0; i < count; i++) objs[i].setPos(initPos[i].x, initPos[i].y);

  selObj  = null;
  grp     = null;
  updateGroupBtns();
  updateSceneBtns();

  inTransition = true;
  transStart   = performance.now();
}

function tickTransition() {
  if (!inTransition) return;
  const t = Math.min((performance.now() - transStart) / T_DUR, 1);
  const e = ease(t);
  for (let i = 0; i < Math.min(objs.length, initPos.length); i++) {
    objs[i].setPos(lerp(initPos[i].x, tgtPos[i].x, e), lerp(initPos[i].y, tgtPos[i].y, e));
  }
  if (t >= 1) inTransition = false;
}

// ── Foco automático no cenário ────────────────────────────────
function focusScene() {
  // Calcula bounding box dos objetos verdes
  const g = objs.filter(o => o.color === C.GREEN);
  if (!g.length) return;
  const xs = g.map(o => o.vx), ys = g.map(o => o.vy);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  panX = canvas.width  / 2 - cx * sc;
  panY = canvas.height / 2 - cy * sc;
}

// ── Render ───────────────────────────────────────────────────
function drawBG() {
  ctx2.fillStyle = C.BG;
  ctx2.fillRect(0, 0, canvas.width, canvas.height);

  // Grid tático
  const gs1 = 50 * sc, gs2 = 200 * sc;
  const drawGrid = (size, style, lw) => {
    ctx2.strokeStyle = style; ctx2.lineWidth = lw;
    const ox = panX % size, oy = panY % size;
    for (let x = ox; x < canvas.width; x += size) {
      ctx2.beginPath(); ctx2.moveTo(x, 0); ctx2.lineTo(x, canvas.height); ctx2.stroke();
    }
    for (let y = oy; y < canvas.height; y += size) {
      ctx2.beginPath(); ctx2.moveTo(0, y); ctx2.lineTo(canvas.width, y); ctx2.stroke();
    }
  };
  drawGrid(gs1, C.GRID,  0.4);
  drawGrid(gs2, C.GRID2, 0.8);

  // Marca de mira central (decorativa)
  const mx = canvas.width/2, my = canvas.height/2;
  ctx2.strokeStyle = 'rgba(0,230,118,0.07)';
  ctx2.lineWidth = 1;
  [[mx-30,my,mx-10,my],[mx+10,my,mx+30,my],[mx,my-30,mx,my-10],[mx,my+10,mx,my+30]].forEach(([x1,y1,x2,y2]) => {
    ctx2.beginPath(); ctx2.moveTo(x1,y1); ctx2.lineTo(x2,y2); ctx2.stroke();
  });
}

function render() {
  tickTransition();
  drawBG();

  // Desenha formas com transformação world→screen
  ctx2.save();
  ctx2.setTransform(sc, 0, 0, sc, panX, panY);
  objs.forEach(o => o.draw(ctx2));
  ctx2.restore();

  // Labels em coordenadas de tela (tamanho fixo)
  objs.forEach(o => o.drawLabel(ctx2, sc, panX, panY));

  requestAnimationFrame(render);
}

// ── Eventos de ponteiro (mouse + touch) ──────────────────────
let lastPX = 0, lastPY = 0; // screen coords

function onDown(sx, sy) {
  const w = s2w(sx, sy);
  // Verifica se clicou em objeto (ordem reversa = topo primeiro)
  for (let i = objs.length-1; i >= 0; i--) {
    if (objs[i].hit(w.x, w.y)) {
      selObj = objs[i];
      objs.forEach(o => o.sel = false);
      selObj.sel = true;
      dragging = true;
      document.getElementById('selected-label').textContent = selObj.label;
      break;
    }
  }
  if (!dragging) { panning = true; }
  lastPX = sx; lastPY = sy;
}

function onMove(sx, sy) {
  const dsx = sx - lastPX, dsy = sy - lastPY;
  const dwx = dsx / sc,    dwy = dsy / sc;

  if (dragging && selObj && !inTransition) {
    const grpMembers = grp === 'COMANDO' ? GROUP_COMANDO : grp === 'APOIO' ? GROUP_APOIO : null;
    if (grpMembers && grpMembers.includes(selObj.label)) {
      objs.filter(o => grpMembers.includes(o.label)).forEach(o => o.move(dwx, dwy));
    } else {
      selObj.move(dwx, dwy);
    }
  } else if (panning) {
    panX += dsx; panY += dsy;
  }
  lastPX = sx; lastPY = sy;
}

function onUp() {
  dragging = false;
  panning  = false;
}

// Mouse
canvas.addEventListener('mousedown', e => { e.preventDefault(); onDown(e.clientX, e.clientY - document.getElementById('header').offsetHeight); });
canvas.addEventListener('mousemove', e => { onMove(e.clientX, e.clientY - document.getElementById('header').offsetHeight); });
canvas.addEventListener('mouseup',   ()  => onUp());

// Touch
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0];
  onDown(t.clientX, t.clientY - document.getElementById('header').offsetHeight);
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const t = e.touches[0];
  onMove(t.clientX, t.clientY - document.getElementById('header').offsetHeight);
}, { passive: false });
canvas.addEventListener('touchend', e => { e.preventDefault(); onUp(); }, { passive: false });

// ── UI helpers ────────────────────────────────────────────────
function updateGroupBtns() {
  document.getElementById('btn-comando').classList.toggle('active', grp === 'COMANDO');
  document.getElementById('btn-apoio').classList.toggle('active',   grp === 'APOIO');
}
function updateSceneBtns() {
  document.querySelectorAll('.scene-btn').forEach(b => {
    b.classList.toggle('active', SCENES[b.dataset.scenario] === activeSetupFn);
  });
}

// ── Init ──────────────────────────────────────────────────────
function init() {
  resize();
  window.addEventListener('resize', () => { resize(); });

  // Botões de cenário
  document.querySelectorAll('.scene-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      startTransition(SCENES[btn.dataset.scenario]);
      setTimeout(focusScene, 50);
    });
  });

  // Grupos
  document.getElementById('btn-comando').addEventListener('click', () => {
    grp = grp === 'COMANDO' ? null : 'COMANDO';
    updateGroupBtns();
  });
  document.getElementById('btn-apoio').addEventListener('click', () => {
    grp = grp === 'APOIO' ? null : 'APOIO';
    updateGroupBtns();
  });

  // Rotacionar
  document.getElementById('btn-rotate').addEventListener('click', () => {
    if (selObj) selObj.rotate(Math.PI / 4);
  });

  // Centralizar
  document.getElementById('btn-center').addEventListener('click', focusScene);

  // Previne scroll padrão na tela inteira
  document.body.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  // Cenário inicial
  setupEmbarcado();
  activeSetupFn = setupEmbarcado;
  updateSceneBtns();
  setTimeout(focusScene, 100);

  render();
}

init();
