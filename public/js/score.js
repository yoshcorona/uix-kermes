/* =========================================================
   UIX KERMES — Arcade 3D Score Room
   Three.js + anime.js · First-person controls
   ========================================================= */

const raw = localStorage.getItem('uix_participant');
if (!raw) location.replace('/');
const participant = JSON.parse(raw);
const playerName = `${participant.first_name} ${participant.last_name}`.toUpperCase();

document.getElementById('hudName').textContent = playerName;
document.getElementById('scoreName').textContent = playerName;
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('uix_participant');
  location.replace('/');
});

const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
  (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
if (IS_TOUCH) document.body.classList.add('touch');

// Adaptar textos de la pantalla de bienvenida para móvil
if (IS_TOUCH) {
  const ctaEl = document.querySelector('.lockhint-cta');
  if (ctaEl) ctaEl.textContent = 'TOCA PARA EXPLORAR';
  const keysEl = document.querySelector('.lockhint-keys');
  if (keysEl) keysEl.textContent = 'JOYSTICK · MOVER  ·  ARRASTRA · MIRAR  ·  BOTÓN E · INTERACTUAR';
  const hudTipEl = document.getElementById('hudTip');
  if (hudTipEl) hudTipEl.textContent = 'TOCA PARA EXPLORAR';
}

const PALETTE = {
  bg:       0x07070F,
  floor:    0x0a0a1e,
  wall:     0x141430,
  surface:  0x1A1A3E,
  surface2: 0x2A2A55,
  purple:   0x6B4FFF,
  green:    0x00FF88,
  lilac:    0x9B59FF,
  pink:     0xFF4FB8,
  orange:   0xFF8C2A,
  gold:     0xFFD700,
};

const ROOM = { w: 16, d: 16, h: 5 };
let CAB_POS;
const INTERACT_RADIUS = 3.2;

let canvas;
let renderer;
let scene;
let camera;

/* =========================================================
   ROOM
   ========================================================= */
function makeGridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0a1e'; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(107,79,255,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,255,136,0.6)';
  for (let x = 0; x <= 256; x += 32)
    for (let y = 0; y <= 256; y += 32)
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function makeWallTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  // base gradient (dark indigo)
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0,  '#0e0e22');
  g.addColorStop(1,  '#1c1c40');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  // panel divisions
  ctx.strokeStyle = 'rgba(107,79,255,0.18)';
  ctx.lineWidth = 2;
  for (let x = 32; x < 256; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
  }
  // accent neon strips
  ctx.fillStyle = 'rgba(0,255,136,0.18)';
  ctx.fillRect(0, 96, 256, 1);
  ctx.fillStyle = 'rgba(255,79,184,0.18)';
  ctx.fillRect(0, 168, 256, 1);
  // distant pixel "lights"
  const palette = ['#00FF88', '#FF4FB8', '#9B59FF', '#FFD700', '#FF8C2A'];
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = palette[i % palette.length];
    ctx.globalAlpha = 0.35 + Math.random() * 0.45;
    const x = Math.floor(Math.random() * 256);
    const y = Math.floor(Math.random() * 256);
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#08081c';
  ctx.fillRect(0, 0, 256, 256);
  // major grid
  ctx.strokeStyle = 'rgba(107,79,255,0.7)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  // minor grid
  ctx.strokeStyle = 'rgba(107,79,255,0.22)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 256; i += 8) {
    if (i % 32 === 0) continue;
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  // intersection dots
  ctx.fillStyle = 'rgba(0,255,136,0.85)';
  for (let x = 0; x <= 256; x += 32)
    for (let y = 0; y <= 256; y += 32)
      ctx.fillRect(x - 2, y - 2, 4, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function buildRoom() {
  const floorTex = makeFloorTexture();
  floorTex.repeat.set(4, 4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.w, ROOM.d),
    new THREE.MeshBasicMaterial({ map: floorTex })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const wallTex = makeWallTexture();
  wallTex.repeat.set(3, 1);
  const wallMat = new THREE.MeshBasicMaterial({ map: wallTex });
  const t = 0.2;
  const mkWall = (w, h, d) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);

  const back = mkWall(ROOM.w, ROOM.h, t);
  back.position.set(0, ROOM.h / 2, -ROOM.d / 2);
  scene.add(back);

  const front = mkWall(ROOM.w, ROOM.h, t);
  front.position.set(0, ROOM.h / 2, ROOM.d / 2);
  scene.add(front);

  const left = mkWall(t, ROOM.h, ROOM.d);
  left.position.set(-ROOM.w / 2, ROOM.h / 2, 0);
  scene.add(left);

  const right = mkWall(t, ROOM.h, ROOM.d);
  right.position.set(ROOM.w / 2, ROOM.h / 2, 0);
  scene.add(right);

  // Neon strips a lo largo de las paredes
  const stripColors = [PALETTE.green, PALETTE.lilac, PALETTE.pink, PALETTE.purple];
  stripColors.forEach((color, i) => {
    const horiz = i < 2;
    const stripMat = new THREE.MeshBasicMaterial({ color });
    const len = horiz ? ROOM.w - 0.4 : ROOM.d - 0.4;
    const strip = new THREE.Mesh(
      horiz ? new THREE.BoxGeometry(len, 0.08, 0.08) : new THREE.BoxGeometry(0.08, 0.08, len),
      stripMat
    );
    if (i === 0) strip.position.set(0, 0.15, -ROOM.d / 2 + 0.1);
    if (i === 1) strip.position.set(0, ROOM.h - 0.4, -ROOM.d / 2 + 0.1);
    if (i === 2) strip.position.set(-ROOM.w / 2 + 0.1, 0.15, 0);
    if (i === 3) strip.position.set(ROOM.w / 2 - 0.1, 0.15, 0);
    scene.add(strip);
  });

  // Techo
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.w, ROOM.d),
    new THREE.MeshBasicMaterial({ color: 0x0a0a18 })
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM.h;
  scene.add(ceil);

  // Letrero gigante en la pared del fondo
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 1.4),
    new THREE.MeshBasicMaterial({ map: makeBannerTexture(), transparent: true })
  );
  banner.position.set(0, 3.6, -ROOM.d / 2 + 0.15);
  scene.add(banner);

  // Luces ambientales (PointLight para acento neón)
  [
    [-5, 4, -5, PALETTE.green,  6],
    [ 5, 4, -5, PALETTE.lilac,  6],
    [-5, 4,  5, PALETTE.pink,   6],
    [ 5, 4,  5, PALETTE.purple, 6],
    [ 0, 4,  0, PALETTE.gold,   5],
  ].forEach(([x, y, z, color, dist]) => {
    const l = new THREE.PointLight(color, 1.1, dist, 2);
    l.position.set(x, y, z);
    scene.add(l);
  });
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
}

function makeBannerTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 192;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(7,7,15,0.0)';
  ctx.fillRect(0, 0, 1024, 192);

  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0,    '#00FF88');
  grad.addColorStop(0.4,  '#6B4FFF');
  grad.addColorStop(0.7,  '#9B59FF');
  grad.addColorStop(1,    '#FF4FB8');
  ctx.font = 'bold 120px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(0,255,136,0.7)';
  ctx.shadowBlur = 20;
  ctx.fillText('UIX KERMES', 512, 96);

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/* =========================================================
   CABINET
   ========================================================= */
const cabinet = new THREE.Group();
let screenMesh, screenCanvas, screenCtx, screenTexture;
let screenLight;

function buildCabinet() {
  // Base
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.4, 1.4),
    new THREE.MeshBasicMaterial({ color: PALETTE.surface })
  );
  base.position.y = 0.2;
  cabinet.add(base);

  // Coin slot detail
  const coin = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 0.04),
    new THREE.MeshBasicMaterial({ color: PALETTE.gold })
  );
  coin.position.set(0, 0.3, 0.72);
  cabinet.add(coin);

  // Body (cuerpo principal) — más bajo, escala humana
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.8, 1.2),
    new THREE.MeshBasicMaterial({ color: PALETTE.surface2 })
  );
  body.position.y = 1.3;
  cabinet.add(body);

  // Bordes neón laterales del cuerpo
  [-1, 1].forEach(sx => {
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 1.8, 0.06),
      new THREE.MeshBasicMaterial({ color: PALETTE.lilac })
    );
    edge.position.set(sx * 0.93, 1.3, 0.62);
    cabinet.add(edge);
  });

  // Marquee superior — caja con front plane para que la textura quede nítida
  const marqueeTex = makeMarqueeTexture();
  const marqueeBack = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.62, 0.3),
    new THREE.MeshBasicMaterial({ color: 0x070718 })
  );
  marqueeBack.position.set(0, 2.5, 0.55);
  cabinet.add(marqueeBack);
  const marqueeFront = new THREE.Mesh(
    new THREE.PlaneGeometry(2.16, 0.58),
    new THREE.MeshBasicMaterial({ map: marqueeTex })
  );
  marqueeFront.position.set(0, 2.5, 0.71);
  cabinet.add(marqueeFront);

  // Luz que ilumina el marquee
  const marqueeLight = new THREE.PointLight(PALETTE.gold, 0.6, 3, 2);
  marqueeLight.position.set(0, 2.5, 1.1);
  cabinet.add(marqueeLight);

  // Pantalla CRT (canvas dinámico) — a altura de ojos
  screenCanvas = document.createElement('canvas');
  screenCanvas.width = 512;
  screenCanvas.height = 384;
  screenCtx = screenCanvas.getContext('2d');
  screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.magFilter = THREE.NearestFilter;
  screenTexture.minFilter = THREE.LinearFilter;

  const SCREEN_Y = 1.6;
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.15, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x07070F })
  );
  bezel.position.set(0, SCREEN_Y, 0.62);
  cabinet.add(bezel);

  screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 1.0),
    new THREE.MeshBasicMaterial({ map: screenTexture })
  );
  screenMesh.position.set(0, SCREEN_Y, 0.67);
  cabinet.add(screenMesh);

  screenLight = new THREE.PointLight(PALETTE.green, 1.1, 4);
  screenLight.position.set(0, SCREEN_Y, 1.4);
  cabinet.add(screenLight);

  // Panel de control (inclinado, a altura de manos)
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.2, 0.7),
    new THREE.MeshBasicMaterial({ color: PALETTE.surface })
  );
  panel.position.set(0, 0.92, 0.7);
  panel.rotation.x = -0.4;
  cabinet.add(panel);

  // Joystick
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.26, 8),
    new THREE.MeshBasicMaterial({ color: 0x222244 })
  );
  stick.position.set(-0.5, 1.05, 0.82);
  stick.rotation.x = -0.4;
  cabinet.add(stick);
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 12),
    new THREE.MeshBasicMaterial({ color: PALETTE.pink })
  );
  ball.position.set(-0.5, 1.18, 0.82);
  cabinet.add(ball);

  // Botones
  const btnColors = [PALETTE.green, PALETTE.gold, PALETTE.pink];
  btnColors.forEach((c, i) => {
    const btn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12),
      new THREE.MeshBasicMaterial({ color: c })
    );
    btn.position.set(0.1 + i * 0.2, 1.05, 0.82);
    btn.rotation.x = Math.PI / 2 - 0.4;
    cabinet.add(btn);
  });

  cabinet.position.copy(CAB_POS);
  scene.add(cabinet);

  drawScreenAttract(0);
}

let mainMarquee = null;

function createMainMarquee() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  return { canvas: c, ctx, tex };
}

function drawMainMarquee(t) {
  const ctx = mainMarquee.ctx;

  // Fondo CRT con gradiente
  const bg = ctx.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0,   '#0a0a20');
  bg.addColorStop(0.5, '#1a0a30');
  bg.addColorStop(1,   '#0a0a20');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);

  // Borde neón doble (rosa + verde)
  ctx.strokeStyle = '#FF4FB8';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 504, 120);
  ctx.strokeStyle = '#00FF88';
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 8, 496, 112);

  // Bombillas LED arriba y abajo (color secuencial parpadeando)
  const ledColors = ['#FF4FB8', '#FFD700', '#00FF88', '#9B59FF', '#3399FF', '#FF8C2A'];
  const phase = Math.floor(t * 5);
  for (let i = 0; i < 14; i++) {
    const x = 28 + i * 34;
    const topCol = ledColors[(i + phase) % ledColors.length];
    const botCol = ledColors[(i + phase + 3) % ledColors.length];
    // top bulb
    ctx.fillStyle = topCol;
    ctx.beginPath(); ctx.arc(x, 18, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(x - 1, 16, 2, 2);
    // bottom bulb
    ctx.fillStyle = botCol;
    ctx.beginPath(); ctx.arc(x, 110, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(x - 1, 108, 2, 2);
  }

  // Título principal con glow multicapa
  ctx.font = 'bold 44px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // capas de glow
  const glowCols = ['#FF4FB8', '#9B59FF', '#00FF88'];
  glowCols.forEach((col, i) => {
    ctx.shadowColor = col;
    ctx.shadowBlur = 22 - i * 5;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.4;
    ctx.fillText('UIX KERMES', 256, 54);
  });
  ctx.globalAlpha = 1;
  // Texto principal
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('UIX KERMES', 256, 54);
  ctx.shadowBlur = 0;

  // Ticker scrolleable
  ctx.font = '11px "Press Start 2P", monospace';
  ctx.fillStyle = '#FFD700';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const tickerText = '★  AI CHAMPS FEST 2026  ★  SCORE ARCADE  ★  ¡ACÉRCATE Y PRESIONA E !  ★  ';
  const tickerW = ctx.measureText(tickerText).width || 600;
  const offset = (t * 50) % tickerW;
  ctx.save();
  ctx.beginPath();
  ctx.rect(28, 78, 456, 20);
  ctx.clip();
  let x = 28 - offset;
  while (x < 500) {
    ctx.fillText(tickerText, x, 88);
    x += tickerW;
  }
  ctx.restore();

  // Scanlines suaves
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < 128; y += 3) ctx.fillRect(0, y, 512, 1);

  mainMarquee.tex.needsUpdate = true;
}

function makeMarqueeTexture() {
  mainMarquee = createMainMarquee();
  drawMainMarquee(0);
  return mainMarquee.tex;
}

const attractStars = [];
for (let i = 0; i < 70; i++) {
  attractStars.push({
    x: Math.random() * 512,
    baseY: Math.random() * 384,
    speed: 25 + Math.random() * 110,
    bright: Math.random() > 0.55,
  });
}

const ALIEN_PATTERN = [
  '00100100',
  '00111100',
  '01111110',
  '11011011',
  '11111111',
  '01100110',
  '11000011',
  '01100110',
];
const SHIP_PATTERN = [
  '00011000',
  '00111100',
  '01111110',
  '11111111',
  '11011011',
];

function drawPixelSprite(ctx, pattern, cx, cy, color, scale) {
  ctx.fillStyle = color;
  for (let y = 0; y < pattern.length; y++) {
    const row = pattern[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '1') ctx.fillRect(cx + x * scale, cy + y * scale, scale, scale);
    }
  }
}

function drawScreenAttract(t) {
  const ctx = screenCtx;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 512, 384);

  // Starfield
  attractStars.forEach(s => {
    const y = (s.baseY + s.speed * t) % 400;
    ctx.fillStyle = s.bright ? '#FFFFFF' : '#5566AA';
    ctx.fillRect(Math.floor(s.x), Math.floor(y), 2, 2);
  });

  ctx.textBaseline = 'middle';

  // HUD superior: 1UP · HIGH SCORE
  ctx.font = '14px "Press Start 2P", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FF3333';
  ctx.fillText('1UP', 24, 26);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('HIGH SCORE', 168, 26);
  ctx.fillStyle = '#FFFF66';
  ctx.fillText('00', 24, 48);
  const topRow = (attractData && attractData.leaderboard && attractData.leaderboard[0]);
  const topPts = topRow ? String(topRow.total).padStart(4, '0') : '0000';
  ctx.fillText(topPts, 200, 48);

  // Título (parpadea)
  if (Math.floor(t * 0.8) % 2 === 0) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px "Press Start 2P", monospace';
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = '#FF8C2A';
    ctx.shadowBlur = 12;
    ctx.fillText('UIX KERMES', 256, 96);
    ctx.shadowBlur = 0;
  }

  // Flota alien (3 filas, oscilan lateralmente)
  const wave = Math.sin(t * 0.65) * 50;
  const colors = ['#FF4FB8', '#9B59FF', '#00FF88'];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      const x = 50 + col * 64 + wave;
      const y = 140 + row * 38;
      drawPixelSprite(ctx, ALIEN_PATTERN, x, y, colors[row], 3);
    }
  }

  // Nave del jugador (desliza horizontal)
  const shipX = 240 + Math.sin(t * 1.1) * 90;
  drawPixelSprite(ctx, SHIP_PATTERN, shipX, 310, '#00FF88', 4);

  // Disparos de la nave
  const bulletPhase = (t * 1.4) % 1;
  const bulletY = 308 - bulletPhase * 180;
  if (bulletY > 80) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(shipX + 14, bulletY, 4, 12);
  }

  // PRESS E TO PLAY
  if (Math.floor(t * 1.5) % 2 === 0) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px "Press Start 2P", monospace';
    ctx.fillStyle = '#00FF88';
    ctx.shadowColor = '#00FF88';
    ctx.shadowBlur = 12;
    ctx.fillText('▶ PRESS  E  TO  PLAY ◀', 256, 360);
    ctx.shadowBlur = 0;
  }

  // Scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = 0; y < 384; y += 4) ctx.fillRect(0, y, 512, 2);

  // Vignette
  const vig = ctx.createRadialGradient(256, 192, 100, 256, 192, 280);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, 512, 384);

  screenTexture.needsUpdate = true;
}

/* =========================================================
   DECORACIONES (cabinets adicionales y partículas)
   ========================================================= */
function buildDecor() {
  // Partículas flotantes
  const partCount = 60;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(partCount * 3);
  const colors = new Float32Array(partCount * 3);
  for (let i = 0; i < partCount; i++) {
    positions[i*3]   = (Math.random() - 0.5) * ROOM.w;
    positions[i*3+1] = Math.random() * ROOM.h;
    positions[i*3+2] = (Math.random() - 0.5) * ROOM.d;
    const palette = [PALETTE.green, PALETTE.lilac, PALETTE.pink, PALETTE.gold];
    const col = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
    colors[i*3] = col.r; colors[i*3+1] = col.g; colors[i*3+2] = col.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.08, vertexColors: true,
    transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending,
  });
  particles = new THREE.Points(geo, mat);
  scene.add(particles);
}

let particles;

/* =========================================================
   ARCADE HALL — maquinitas decorativas alrededor
   ========================================================= */
const decorCabinets = [];

function makeDecorMarquee(label, accent) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  const hex = '#' + new THREE.Color(accent).getHexString();
  grad.addColorStop(0, hex);
  grad.addColorStop(0.5, '#6B4FFF');
  grad.addColorStop(1, '#9B59FF');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold 20px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#07070F';
  ctx.fillText(label, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function makeDecorScreenCanvas() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return { canvas: c, ctx, tex };
}

function drawDecorScreen(ctx, t, kind, accent) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 96);

  if (kind === 0) {
    // Tetris-ish bloques cayendo
    const colors = ['#FF4FB8', '#00FF88', '#FFD700', '#9B59FF', '#3399FF'];
    for (let i = 0; i < 16; i++) {
      const x = ((i * 17 + Math.floor(t * 10)) % 128);
      const y = ((i * 11 + Math.floor(t * 35)) % 96);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(x, y, 8, 8);
    }
  } else if (kind === 1) {
    // Pong
    const padL = 30 + Math.sin(t * 1.3) * 20;
    const padR = 30 + Math.sin(t * 1.7 + 1) * 20;
    ctx.fillStyle = '#00FF88';
    ctx.fillRect(6, padL, 3, 24);
    ctx.fillRect(119, padR, 3, 24);
    const bx = 64 + Math.sin(t * 1.9) * 50;
    const by = 48 + Math.cos(t * 2.3) * 30;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(bx, by, 4, 4);
  } else if (kind === 2) {
    // Galaxy invasores
    for (let i = 0; i < 28; i++) {
      ctx.fillStyle = '#FFFFFF';
      const x = (i * 19.7) % 128;
      const y = ((i * 13 + t * 70) % 96);
      ctx.fillRect(x, y, 1, 1);
    }
    const wave = Math.sin(t * 0.8) * 16;
    for (let r = 0; r < 2; r++)
      for (let col = 0; col < 5; col++) {
        ctx.fillStyle = ['#FF4FB8', '#9B59FF'][r];
        const ax = 14 + col * 22 + wave;
        const ay = 18 + r * 16;
        ctx.fillRect(ax, ay, 8, 6);
        ctx.fillRect(ax + 2, ay - 2, 4, 2);
      }
    const sx = 56 + Math.sin(t * 1.1) * 30;
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(sx, 82, 12, 6);
    ctx.fillRect(sx + 5, 78, 2, 4);
  } else {
    // Maze / pacman
    ctx.fillStyle = '#3399FF';
    for (let y = 0; y < 96; y += 12) {
      for (let x = 0; x < 128; x += 12) {
        if ((x + y + Math.floor(t * 1.4) * 12) % 36 === 0)
          ctx.fillRect(x, y, 10, 10);
      }
    }
    const hx = 60 + Math.sin(t * 1.6) * 48;
    const hy = 40 + Math.cos(t * 1.2) * 28;
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(hx + 4, hy + 4, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < 96; y += 3) ctx.fillRect(0, y, 128, 1);
  // glow tinted overlay
  ctx.fillStyle = 'rgba(' + Math.floor((accent >> 16) & 255) + ',' + Math.floor((accent >> 8) & 255) + ',' + Math.floor(accent & 255) + ',0.08)';
  ctx.fillRect(0, 0, 128, 96);
}

function buildArcadeHall() {
  // slots de cabinets decorativos: [x, z, rotY, label]
  const slots = [
    { x: -5.6, z: -7.0, rot: 0,             label: 'INVADERS' },
    { x: -1.9, z: -7.0, rot: 0,             label: 'GALAXY' },
    { x:  1.9, z: -7.0, rot: 0,             label: 'PIXEL FURY' },
    { x:  5.6, z: -7.0, rot: 0,             label: 'NEON RUN' },
    { x: -7.0, z: -3.5, rot:  Math.PI / 2,  label: 'CYBER 99' },
    { x: -7.0, z:  0.0, rot:  Math.PI / 2,  label: 'METEOR' },
    { x: -7.0, z:  3.5, rot:  Math.PI / 2,  label: 'TURBO' },
    { x:  7.0, z: -3.5, rot: -Math.PI / 2,  label: 'STAR BLAST' },
    { x:  7.0, z:  3.5, rot: -Math.PI / 2,  label: 'MAZE-X' },
  ];
  const accents = [PALETTE.pink, PALETTE.lilac, PALETTE.green, PALETTE.gold, PALETTE.orange, PALETTE.purple];

  slots.forEach((slot, i) => {
    const g = new THREE.Group();
    const accent = accents[i % accents.length];

    // Base
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.45, 1.1),
      new THREE.MeshBasicMaterial({ color: PALETTE.surface })
    );
    base.position.y = 0.225;
    g.add(base);

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 2.3, 1.0),
      new THREE.MeshBasicMaterial({ color: PALETTE.surface2 })
    );
    body.position.y = 1.6;
    g.add(body);

    // Neon trim laterales
    [-1, 1].forEach(sx => {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 2.2, 0.05),
        new THREE.MeshBasicMaterial({ color: accent })
      );
      edge.position.set(sx * 0.66, 1.6, 0.52);
      g.add(edge);
    });

    // Marquee
    const marquee = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.32),
      new THREE.MeshBasicMaterial({ map: makeDecorMarquee(slot.label, accent) })
    );
    marquee.position.set(0, 2.82, 0.515);
    g.add(marquee);

    // Pantalla animada
    const sc = makeDecorScreenCanvas();
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 0.78),
      new THREE.MeshBasicMaterial({ map: sc.tex })
    );
    screen.position.set(0, 2.05, 0.515);
    g.add(screen);

    // Bezel oscuro alrededor
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.9, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x07070F })
    );
    bezel.position.set(0, 2.05, 0.505);
    g.add(bezel);

    // Panel de control con joystick + 2 botones
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.15, 0.55),
      new THREE.MeshBasicMaterial({ color: PALETTE.surface })
    );
    panel.position.set(0, 0.95, 0.55);
    panel.rotation.x = -0.4;
    g.add(panel);
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8),
      new THREE.MeshBasicMaterial({ color: 0x222244 })
    );
    stick.position.set(-0.35, 1.08, 0.65);
    stick.rotation.x = -0.4;
    g.add(stick);
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 10, 10),
      new THREE.MeshBasicMaterial({ color: accent })
    );
    knob.position.set(-0.35, 1.18, 0.65);
    g.add(knob);
    [0.05, 0.25].forEach((bx, k) => {
      const btn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12),
        new THREE.MeshBasicMaterial({ color: k === 0 ? PALETTE.green : PALETTE.gold })
      );
      btn.position.set(bx, 1.08, 0.65);
      btn.rotation.x = Math.PI / 2 - 0.4;
      g.add(btn);
    });

    // Glow del frente
    const light = new THREE.PointLight(accent, 0.7, 3.5, 2);
    light.position.set(0, 1.9, 0.9);
    g.add(light);

    g.position.set(slot.x, 0, slot.z);
    g.rotation.y = slot.rot;
    scene.add(g);

    decorCabinets.push({
      group: g, slot, screen: sc,
      kind: i % 4, accent,
    });
  });
}

function updateDecorScreens(t) {
  for (let i = 0; i < decorCabinets.length; i++) {
    const c = decorCabinets[i];
    drawDecorScreen(c.screen.ctx, t + i * 4.3, c.kind, c.accent);
    c.screen.tex.needsUpdate = true;
  }
}

/* =========================================================
   SODA FOUNTAIN
   ========================================================= */
function makeBacksplashTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0a18';
  ctx.fillRect(0, 0, 256, 256);
  // shelves
  ctx.strokeStyle = '#9B59FF';
  ctx.lineWidth = 2;
  [80, 150, 220].forEach(y => {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  });
  // bottles
  const colors = ['#FF3333','#FFD700','#00FF88','#9B59FF','#3399FF','#FF8C2A','#FF4FB8','#00CED1'];
  let cIdx = 0;
  [40, 110, 180].forEach(y => {
    for (let x = 18; x < 240; x += 22) {
      const col = colors[cIdx++ % colors.length];
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 14, 36);
      // shine
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x + 2, y + 4, 2, 20);
      // cap
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(x + 4, y - 5, 6, 5);
      // neck
      ctx.fillStyle = col;
      ctx.fillRect(x + 5, y - 1, 4, 2);
    }
  });
  // vignette
  const vig = ctx.createRadialGradient(128, 128, 80, 128, 128, 200);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function makeSodaSignTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#08081c';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#FF4FB8';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.strokeStyle = '#00FF88';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, 484, 100);
  ctx.font = 'bold 52px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#FF4FB8';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#FFD700';
  ctx.fillText('★ SODAS ★', 256, 64);
  ctx.shadowBlur = 0;
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function buildSodaFountain() {
  const g = new THREE.Group();

  // Counter (local +z = front side hacia clientes)
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.0, 0.7),
    new THREE.MeshBasicMaterial({ color: 0xE8E8FF })
  );
  counter.position.set(0, 0.5, 0);
  g.add(counter);

  // Trim dorado en el tope
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, 0.05, 0.75),
    new THREE.MeshBasicMaterial({ color: PALETTE.gold })
  );
  trim.position.set(0, 1.025, 0);
  g.add(trim);

  // Backsplash (al fondo)
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 2.4, 0.1),
    new THREE.MeshBasicMaterial({ map: makeBacksplashTexture() })
  );
  back.position.set(0, 2.0, -0.35);
  g.add(back);

  // Dispensadores
  const dispCols = [0xFF3333, 0xFFD700, 0x00FF88, 0x9B59FF, 0x3399FF];
  dispCols.forEach((col, i) => {
    const dx = -1.0 + i * 0.5;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.55, 12),
      new THREE.MeshBasicMaterial({ color: 0x333344 })
    );
    body.position.set(dx, 1.33, -0.15);
    g.add(body);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.08, 12),
      new THREE.MeshBasicMaterial({ color: col })
    );
    cap.position.set(dx, 1.65, -0.15);
    g.add(cap);
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 0.13, 8),
      new THREE.MeshBasicMaterial({ color: 0x111122 })
    );
    nozzle.position.set(dx, 1.01, -0.05);
    g.add(nozzle);
    // botón frontal de color
    const btn = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.08, 0.02),
      new THREE.MeshBasicMaterial({ color: col })
    );
    btn.position.set(dx, 1.45, -0.02);
    g.add(btn);
  });

  // Neon sign
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.55),
    new THREE.MeshBasicMaterial({ map: makeSodaSignTexture() })
  );
  sign.position.set(0, 3.1, -0.28);
  g.add(sign);

  // Luces
  const lR = new THREE.PointLight(0xFF3333, 0.7, 4, 2);
  lR.position.set(-0.9, 2.3, 0.6); g.add(lR);
  const lB = new THREE.PointLight(0x3399FF, 0.7, 4, 2);
  lB.position.set(0.9, 2.3, 0.6); g.add(lB);
  const lG = new THREE.PointLight(PALETTE.gold, 0.5, 3, 2);
  lG.position.set(0, 2.7, -0.1); g.add(lG);

  // Posicionar en la pared derecha donde estaba ARCADE
  g.position.set(7.0, 0, 0);
  g.rotation.y = -Math.PI / 2; // front (+z local) → world -x (hacia el centro)
  scene.add(g);
}

/* =========================================================
   MÚSICA CHIPTUNE 8-BIT
   ========================================================= */
let audioCtx = null;
let masterGain = null;
let musicEnabled = false;
let musicTimer = null;
let melodyIdx = 0;
let bassIdx = 0;
let nextNote = 0;

// frecuencia desde semitonos relativos a A4 (440 Hz). C4 = -9.
const SEMI = (n) => 440 * Math.pow(2, (n - 9) / 12);

// Melodía bucle (semitonos desde C4=0); -1 = silencio
const MELODY = [
  12, -1, 16, -1, 19, 24, 19, 16,
  17, -1, 14, -1, 12, -1, -1, -1,
  14, -1, 17, -1, 21, 24, 21, 17,
  16, -1, 12, -1, 14, -1, -1, -1,
];
const BASS = [0, 7, 5, 7]; // notas root (cada compás)
const STEP_SEC = 60 / 132 / 2; // 8th @ 132 BPM

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.15;
  masterGain.connect(audioCtx.destination);
  return audioCtx;
}

function blip(freq, duration, time, type = 'square', vol = 0.18) {
  const o = audioCtx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(vol, time + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, time + duration);
  o.connect(g).connect(masterGain);
  o.start(time);
  o.stop(time + duration + 0.02);
}

function scheduleAhead() {
  if (!audioCtx) return;
  while (nextNote < audioCtx.currentTime + 0.25) {
    const m = MELODY[melodyIdx % MELODY.length];
    if (m >= 0) blip(SEMI(m + 12), STEP_SEC * 0.85, nextNote, 'square', 0.12);
    if (melodyIdx % 8 === 0) {
      const b = BASS[bassIdx % BASS.length];
      blip(SEMI(b - 12), STEP_SEC * 8 * 0.95, nextNote, 'triangle', 0.16);
      bassIdx++;
    }
    if (melodyIdx % 2 === 0) {
      // hi-hat (square alto, muy corto)
      blip(6500 + Math.random() * 800, 0.03, nextNote, 'square', 0.025);
    }
    melodyIdx++;
    nextNote += STEP_SEC;
  }
}

function startMusic() {
  if (!ensureAudio()) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (musicTimer) return;
  masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.3);
  nextNote = audioCtx.currentTime + 0.1;
  musicTimer = setInterval(scheduleAhead, 60);
  musicEnabled = true;
  updateMusicBtn();
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  musicEnabled = false;
  if (masterGain && audioCtx) {
    masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);
  }
  updateMusicBtn();
}

function toggleMusic() {
  if (musicEnabled) stopMusic();
  else startMusic();
}

function updateMusicBtn() {
  const btn = document.getElementById('musicBtn');
  if (btn) btn.textContent = musicEnabled ? '♪ MUSIC ON' : '♪ MUSIC OFF';
}

function buildSodaNpcs() {
  // Bartender detrás del counter (lado pared, x=7.4)
  const bart = createNpcMesh(91337);
  bart.position.set(7.35, 0.85, 0);
  bart.rotation.y = -Math.PI / 2; // mira hacia -x (hacia el cliente / centro)
  scene.add(bart);
  npcs.push({
    mesh: bart, type: 'playing',
    fixedRot: -Math.PI / 2,
    bobPhase: Math.random() * Math.PI * 2, bobSpeed: 2.4, swayAmp: 0.04,
  });

  // 3 clientes frente al counter
  [-0.55, 0, 0.55].forEach((dz, i) => {
    const cust = createNpcMesh(92000 + i * 333);
    cust.position.set(5.95, 0.52, dz);
    cust.rotation.y = Math.PI / 2; // mira hacia +x (hacia el counter)
    scene.add(cust);
    npcs.push({
      mesh: cust, type: 'playing',
      fixedRot: Math.PI / 2,
      bobPhase: Math.random() * Math.PI * 2,
      bobSpeed: 2.6 + Math.random() * 0.5,
      swayAmp: 0.05 + Math.random() * 0.04,
    });
  });
}

/* =========================================================
   UIX 8-BIT LOGO FRAMES + NPCs
   ========================================================= */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeUixPixelLogo() {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 160;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Background (CRT-ish dark)
  ctx.fillStyle = '#0a0a1e';
  ctx.fillRect(0, 0, 160, 160);

  // Subtle scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < 160; y += 3) ctx.fillRect(0, y, 160, 1);

  // 8-bit letters U I X
  const PX = 8;
  const U = [
    'X...X',
    'X...X',
    'X...X',
    'X...X',
    'X...X',
    'X...X',
    'XXXXX',
  ];
  const I = [
    'XXX',
    '.X.',
    '.X.',
    '.X.',
    '.X.',
    '.X.',
    'XXX',
  ];
  const X = [
    'X...X',
    'X...X',
    '.X.X.',
    '..X..',
    '.X.X.',
    'X...X',
    'X...X',
  ];
  function drawLetter(grid, ox, oy, color) {
    ctx.fillStyle = color;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === 'X') ctx.fillRect(ox + x * PX, oy + y * PX, PX, PX);
      }
    }
  }
  drawLetter(U, 16, 42, '#00FF88');
  drawLetter(I, 70, 42, '#FFD700');
  drawLetter(X, 100, 42, '#FF4FB8');

  // Subtitle
  ctx.font = 'bold 14px "Press Start 2P", monospace';
  ctx.fillStyle = '#9B59FF';
  ctx.textAlign = 'center';
  ctx.fillText('KERMES', 80, 124);

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function buildUixFrames() {
  const logoTex = makeUixPixelLogo();
  const buildFrame = (wallX, faceInward) => {
    const g = new THREE.Group();
    // Marco dorado (caja delgada)
    const border = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 2.4, 2.4),
      new THREE.MeshBasicMaterial({ color: PALETTE.gold })
    );
    g.add(border);
    // Borde interno oscuro
    const inner = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 2.05, 2.05),
      new THREE.MeshBasicMaterial({ color: 0x111122 })
    );
    g.add(inner);
    // Plano del logo
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({ map: logoTex })
    );
    logo.position.x = faceInward ? 0.08 : -0.08;
    logo.rotation.y = faceInward ? Math.PI / 2 : -Math.PI / 2;
    g.add(logo);
    g.position.set(wallX, 2.4, 0);
    scene.add(g);

    // Luz sobre el cuadro
    const l = new THREE.PointLight(PALETTE.gold, 0.8, 5, 2);
    l.position.set(wallX + (faceInward ? 1 : -1), 2.4, 0);
    scene.add(l);
  };
  buildFrame(-ROOM.w / 2 + 0.12, true);
  buildFrame( ROOM.w / 2 - 0.12, false);
}

function makeNpcTexture(seed) {
  const W = 24, H = 36;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const rng = mulberry32(seed);
  const pick = arr => arr[Math.floor(rng() * arr.length)];

  const SKINS  = ['#FFE3C2','#FFD1A1','#F1C27D','#E0AC69','#C68642','#A0552D','#8B4513'];
  const HAIRS  = ['#1A1A1A','#3A2A1A','#5C3317','#8B4513','#D4A017','#E8B4A0','#FF4FB8','#9B59FF','#00FF88','#FFFFFF','#FF8C2A','#3399FF'];
  const TOPS   = ['#FF4FB8','#00FF88','#FFD700','#6B4FFF','#FF8C2A','#9B59FF','#FF3333','#3399FF','#E8E8FF','#00CED1','#FF1493','#7FFF00','#FFB6C1','#20B2AA'];
  const BOTS   = ['#1A1A3E','#2A2A55','#553333','#333366','#444444','#1f3a1f','#3a1f1f','#5C2E2E','#0a3a5e','#3a0a5e'];
  const SHOES  = ['#000000','#1a1a1a','#3a2a1a','#5C3317','#FFFFFF'];
  const ACCENT = ['#FFD700','#00FF88','#FF4FB8','#9B59FF','#3399FF','#FF8C2A'];

  const skin = pick(SKINS);
  const hair = pick(HAIRS);
  const top  = pick(TOPS);
  const bot  = pick(BOTS);
  const shoe = pick(SHOES);
  const acc  = pick(ACCENT);

  const hairStyle = pick(['short','medium','long','ponytail','bun','mohawk','cap','beanie','spiky']);
  const outfit    = pick(['shirt','shirt','hoodie','dress','dress','overalls','jacket']);
  const hasGlasses = rng() < 0.18;
  const hasStripe  = rng() < 0.35;
  const hasNecklace = rng() < 0.15;

  // ===== HEAD (y=4-13, x=8-15) =====
  ctx.fillStyle = skin;
  ctx.fillRect(8, 5, 8, 8);
  // ear hint
  ctx.fillRect(7, 8, 1, 2);
  ctx.fillRect(16, 8, 1, 2);

  // Hair
  ctx.fillStyle = hair;
  if (hairStyle === 'short') {
    ctx.fillRect(8, 4, 8, 3);
    if (rng() > 0.5) ctx.fillRect(7, 5, 1, 3);
  } else if (hairStyle === 'medium') {
    ctx.fillRect(8, 4, 8, 4);
    ctx.fillRect(7, 5, 1, 6);
    ctx.fillRect(16, 5, 1, 6);
  } else if (hairStyle === 'long') {
    ctx.fillRect(8, 4, 8, 4);
    ctx.fillRect(6, 5, 2, 17);
    ctx.fillRect(16, 5, 2, 17);
    ctx.fillRect(7, 4, 1, 2);
  } else if (hairStyle === 'ponytail') {
    ctx.fillRect(8, 4, 8, 4);
    ctx.fillRect(17, 6, 2, 12);
    ctx.fillRect(7, 5, 1, 2);
  } else if (hairStyle === 'bun') {
    ctx.fillRect(8, 5, 8, 3);
    ctx.fillRect(10, 1, 4, 4);
    ctx.fillRect(11, 0, 2, 1);
  } else if (hairStyle === 'mohawk') {
    ctx.fillRect(10, 0, 4, 6);
    ctx.fillRect(8, 5, 8, 1);
    // tinted tips
    ctx.fillStyle = pick(['#FF4FB8','#00FF88','#FFD700','#9B59FF']);
    ctx.fillRect(11, 0, 2, 2);
  } else if (hairStyle === 'cap') {
    const capCol = pick(['#FF3333','#3399FF','#00FF88','#FFD700','#222222','#9B59FF']);
    ctx.fillStyle = capCol;
    ctx.fillRect(7, 4, 9, 3);
    ctx.fillRect(15, 5, 4, 1);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(11, 5, 2, 1);
  } else if (hairStyle === 'beanie') {
    ctx.fillStyle = pick(['#FF4FB8','#00FF88','#9B59FF','#3399FF','#FFD700']);
    ctx.fillRect(7, 3, 10, 4);
    ctx.fillRect(8, 2, 8, 1);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(7, 6, 10, 1);
  } else if (hairStyle === 'spiky') {
    for (let i = 8; i < 16; i += 2) ctx.fillRect(i, 2, 1, 3);
    ctx.fillRect(8, 4, 8, 3);
  }

  // Eyes
  ctx.fillStyle = '#000000';
  ctx.fillRect(10, 9, 1, 1);
  ctx.fillRect(13, 9, 1, 1);
  // eye shines
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(10, 9, 1, 1);
  ctx.fillStyle = '#000000';
  ctx.fillRect(10, 9, 1, 1);
  ctx.fillRect(13, 9, 1, 1);

  // Glasses
  if (hasGlasses) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(9, 8, 3, 1);
    ctx.fillRect(12, 8, 3, 1);
    ctx.fillRect(9, 8, 1, 3);
    ctx.fillRect(11, 8, 1, 3);
    ctx.fillRect(14, 8, 1, 3);
    ctx.fillRect(9, 10, 6, 1);
  }

  // Mouth
  if (rng() > 0.35) {
    ctx.fillStyle = '#5C2E2E';
    ctx.fillRect(11, 11, 2, 1);
  }

  // Blush
  if (rng() > 0.7) {
    ctx.fillStyle = '#FF8C8C';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(9, 10, 1, 1);
    ctx.fillRect(14, 10, 1, 1);
    ctx.globalAlpha = 1;
  }

  // Neck
  ctx.fillStyle = skin;
  ctx.fillRect(11, 13, 2, 1);

  // Necklace
  if (hasNecklace) {
    ctx.fillStyle = acc;
    ctx.fillRect(10, 14, 4, 1);
  }

  // ===== TORSO =====
  ctx.fillStyle = top;
  if (outfit === 'dress') {
    // dress upper
    ctx.fillRect(7, 14, 10, 12);
    // flared skirt
    ctx.fillRect(6, 26, 12, 6);
    if (rng() > 0.5) {
      // belt
      ctx.fillStyle = '#222';
      ctx.fillRect(7, 22, 10, 1);
      ctx.fillStyle = acc;
      ctx.fillRect(11, 22, 2, 1);
    }
    ctx.fillStyle = top;
  } else if (outfit === 'hoodie') {
    ctx.fillRect(6, 14, 12, 12);
    // hood at back of neck
    ctx.fillRect(7, 13, 10, 2);
    // pocket
    ctx.fillStyle = '#000';
    ctx.globalAlpha = 0.25;
    ctx.fillRect(9, 19, 6, 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = top;
  } else if (outfit === 'overalls') {
    // shirt below
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(7, 14, 10, 5);
    // overall straps + body
    ctx.fillStyle = top;
    ctx.fillRect(9, 14, 2, 4);
    ctx.fillRect(13, 14, 2, 4);
    ctx.fillRect(7, 18, 10, 8);
    // button accent
    ctx.fillStyle = acc;
    ctx.fillRect(9, 19, 1, 1);
    ctx.fillRect(14, 19, 1, 1);
    ctx.fillStyle = top;
  } else if (outfit === 'jacket') {
    ctx.fillRect(7, 14, 10, 12);
    // open collar / lapels
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(11, 14, 2, 6);
    // jacket border
    ctx.fillStyle = acc;
    ctx.fillRect(7, 14, 1, 12);
    ctx.fillRect(16, 14, 1, 12);
    ctx.fillStyle = top;
  } else {
    // shirt
    ctx.fillRect(7, 14, 10, 12);
  }

  // Horizontal stripe accent
  if (hasStripe && outfit !== 'dress' && outfit !== 'overalls') {
    ctx.fillStyle = acc;
    ctx.fillRect(7, 18, 10, 1);
    ctx.fillRect(7, 21, 10, 1);
  }

  // ===== ARMS =====
  ctx.fillStyle = top;
  ctx.fillRect(5, 14, 2, 10);
  ctx.fillRect(17, 14, 2, 10);
  // hands
  ctx.fillStyle = skin;
  ctx.fillRect(5, 24, 2, 2);
  ctx.fillRect(17, 24, 2, 2);

  // ===== LEGS / BOTTOM =====
  if (outfit === 'dress') {
    // legs from skirt down
    ctx.fillStyle = skin;
    ctx.fillRect(8, 32, 3, 2);
    ctx.fillRect(13, 32, 3, 2);
    ctx.fillStyle = shoe;
    ctx.fillRect(7, 34, 4, 2);
    ctx.fillRect(13, 34, 4, 2);
  } else {
    ctx.fillStyle = bot;
    ctx.fillRect(7, 26, 4, 8);
    ctx.fillRect(13, 26, 4, 8);
    // shoes
    ctx.fillStyle = shoe;
    ctx.fillRect(6, 34, 5, 2);
    ctx.fillRect(13, 34, 5, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

const npcs = [];

function createNpcMesh(seed) {
  const tex = makeNpcTexture(seed);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide,
  });
  // proporción 24:36 → 0.66:1.0
  return new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.05), mat);
}

function buildNpcs() {
  let seed = 0;

  // 1) Para cada cabinet decorativo: 1 o 2 NPCs parados al frente, mirando la pantalla
  decorCabinets.forEach((cab) => {
    const slot = cab.slot;
    const fx = Math.sin(slot.rot);
    const fz = Math.cos(slot.rot);
    // perpendicular (lateral)
    const lx = -fz;
    const lz =  fx;
    const count = Math.random() < 0.35 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const lateral = (i - (count - 1) / 2) * 0.45;
      const px = slot.x + fx * 0.95 + lx * lateral;
      const pz = slot.z + fz * 0.95 + lz * lateral;
      const mesh = createNpcMesh(seed++ * 1337 + 7);
      mesh.position.set(px, 0.52, pz);
      // Mirar a la pantalla (cabinet): forward = -front del cabinet ⇒ rotY = slot.rot + π
      const faceRot = slot.rot + Math.PI;
      mesh.rotation.y = faceRot;
      scene.add(mesh);
      npcs.push({
        mesh,
        type: 'playing',
        fixedRot: faceRot,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 2.2 + Math.random() * 2.6,
        swayAmp: 0.05 + Math.random() * 0.05,
      });
    }
  });

  // 2) Wanderers que pasean por el área central, evitando el cabinet principal
  const wanderers = Math.max(0, 22 - npcs.length);
  for (let w = 0; w < wanderers; w++) {
    let bx, bz, tries = 0;
    do {
      bx = (Math.random() - 0.5) * (ROOM.w - 4);
      bz = (Math.random() - 0.5) * (ROOM.d - 4);
      tries++;
    } while ((Math.hypot(bx, bz) < 3.0 || Math.abs(bx) > 5.5 || Math.abs(bz) > 5.5) && tries < 30);

    const mesh = createNpcMesh(seed++ * 1337 + 7);
    mesh.position.set(bx, 0.52, bz);
    scene.add(mesh);
    npcs.push({
      mesh,
      type: 'wander',
      basePos: new THREE.Vector3(bx, 0.52, bz),
      wPhase: Math.random() * Math.PI * 2,
      wSpeed: 0.18 + Math.random() * 0.35,
      wRadius: 0.6 + Math.random() * 1.6,
      bobPhase: Math.random() * Math.PI * 2,
      bobSpeed: 2.5 + Math.random() * 2.5,
      lastX: bx,
      lastZ: bz,
    });
  }
}

function updateNpcs(t) {
  for (const npc of npcs) {
    npc.mesh.position.y = 0.52 + Math.abs(Math.sin(t * npc.bobSpeed + npc.bobPhase)) * 0.05;

    if (npc.type === 'playing') {
      // Pequeño sway corporal (rotación leve), sin girar al jugador
      const sway = Math.sin(t * 1.4 + npc.bobPhase) * npc.swayAmp;
      npc.mesh.rotation.y = npc.fixedRot + sway;
    } else {
      const a = npc.wPhase + t * npc.wSpeed;
      const px = npc.basePos.x + Math.cos(a) * npc.wRadius;
      const pz = npc.basePos.z + Math.sin(a * 0.7) * npc.wRadius;
      const dx = px - npc.lastX;
      const dz = pz - npc.lastZ;
      if (Math.hypot(dx, dz) > 0.001) {
        npc.mesh.rotation.y = Math.atan2(dx, dz);
      }
      npc.mesh.position.x = px;
      npc.mesh.position.z = pz;
      npc.lastX = px; npc.lastZ = pz;
    }
  }
}

// Luces dinámicas en las paredes (color pulsante)
const dynamicLights = [];
function buildDynamicLights() {
  const spots = [
    { pos: [-6, 3.5, -6], hue: 0.35 },
    { pos: [ 6, 3.5, -6], hue: 0.78 },
    { pos: [-6, 3.5,  6], hue: 0.92 },
    { pos: [ 6, 3.5,  6], hue: 0.6  },
  ];
  spots.forEach(s => {
    const l = new THREE.PointLight(0xffffff, 0.8, 8, 2);
    l.position.set(...s.pos);
    scene.add(l);
    dynamicLights.push({ light: l, hue: s.hue });
  });
}
function updateDynamicLights(t) {
  for (const d of dynamicLights) {
    const h = (d.hue + t * 0.05) % 1;
    d.light.color.setHSL(h, 0.85, 0.55);
    d.light.intensity = 0.6 + Math.sin(t * 1.5 + d.hue * 6) * 0.35;
  }
}

/* =========================================================
   PLAYER + CONTROLS
   ========================================================= */
const player = {
  pos: new THREE.Vector3(0, 1.6, 2.8),
  vel: new THREE.Vector3(),
};
const camState = { yaw: 0, pitch: 0 };
let isLocked = false;
let mode = 'roam'; // 'roam' | 'zoom'
const move = { f: false, b: false, l: false, r: false };
let moveAnalogX = 0, moveAnalogY = 0;

const lockHint = document.getElementById('lockHint');
const interactPrompt = document.getElementById('interactPrompt');
const hudTip = document.getElementById('hudTip');
const scoreOverlay = document.getElementById('scoreOverlay');

function lock() {
  if (IS_TOUCH) return;
  if (canvas) canvas.requestPointerLock();
}

/* ---------- Touch controls ---------- */
function setupTouch() {
  const joy = document.getElementById('touchJoystick');
  const knob = document.getElementById('touchJoystickKnob');
  const lookZone = document.getElementById('touchLookZone');
  const interactBtn = document.getElementById('touchActionE');

  let joyId = null, joyStart = { x: 0, y: 0 };
  let lookId = null, lookLast = { x: 0, y: 0 };

  joy.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    joyId = t.identifier;
    joyStart = { x: t.clientX, y: t.clientY };
    e.preventDefault();
  }, { passive: false });
  joy.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      const dx = t.clientX - joyStart.x;
      const dy = t.clientY - joyStart.y;
      const max = 50;
      const len = Math.min(max, Math.hypot(dx, dy));
      const ang = Math.atan2(dy, dx);
      const kx = Math.cos(ang) * len, ky = Math.sin(ang) * len;
      knob.style.transform = `translate(${kx}px, ${ky}px)`;
      moveAnalogX = kx / max;
      moveAnalogY = ky / max;
    }
    e.preventDefault();
  }, { passive: false });
  const releaseJoy = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyId = null;
        knob.style.transform = 'translate(0,0)';
        moveAnalogX = moveAnalogY = 0;
      }
    }
  };
  joy.addEventListener('touchend', releaseJoy);
  joy.addEventListener('touchcancel', releaseJoy);

  lookZone.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    lookId = t.identifier;
    lookLast = { x: t.clientX, y: t.clientY };
    e.preventDefault();
  }, { passive: false });
  lookZone.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      const dx = t.clientX - lookLast.x;
      const dy = t.clientY - lookLast.y;
      lookLast = { x: t.clientX, y: t.clientY };
      camState.yaw   -= dx * 0.005;
      camState.pitch -= dy * 0.005;
      const lim = Math.PI / 2 - 0.05;
      camState.pitch = Math.max(-lim, Math.min(lim, camState.pitch));
    }
    e.preventDefault();
  }, { passive: false });
  const releaseLook = (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
  };
  lookZone.addEventListener('touchend', releaseLook);
  lookZone.addEventListener('touchcancel', releaseLook);

  interactBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (mode === 'roam' && nearCabinet()) zoomIn();
  }, { passive: false });
}

/* =========================================================
   ZOOM IN / OUT
   ========================================================= */
const savedCam = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
let cachedScore = null;
let attractData = null;
let lastBoardHash = '';

function boardHash(board) {
  return (board || []).map(p => `${p.id}:${p.total}`).join('|');
}

async function fetchLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) return null;
    const data = await res.json();
    attractData = data;
    const h = boardHash(data.leaderboard);
    if (h !== lastBoardHash) {
      lastBoardHash = h;
      if (mode === 'zoom' && scoreOverlay.classList.contains('show')) {
        cachedScore = data;
        softRefreshOverlay();
      }
    }
    return data;
  } catch { return null; }
}

fetchLeaderboard();
setInterval(fetchLeaderboard, 3000);

async function zoomIn() {
  if (mode !== 'roam') return;
  cachedScore = await fetchLeaderboard();
  if (!cachedScore) return;

  mode = 'zoom';
  interactPrompt.classList.remove('show');
  if (isLocked) document.exitPointerLock();

  savedCam.pos.copy(player.pos);
  savedCam.yaw = camState.yaw;
  savedCam.pitch = camState.pitch;

  // Posición objetivo: justo frente a la pantalla (a la altura del tablero)
  const targetPos = new THREE.Vector3(0, 1.6, 1.7);
  const targetYaw = 0;
  const targetPitch = 0;

  anime({
    targets: player.pos,
    x: targetPos.x, y: targetPos.y, z: targetPos.z,
    duration: 900,
    easing: 'easeInOutCubic',
  });
  anime({
    targets: camState,
    yaw: targetYaw, pitch: targetPitch,
    duration: 900,
    easing: 'easeInOutCubic',
    complete: renderScoreOverlay,
  });
}

function rowHTML(rank, row, isMe) {
  const name = row
    ? `${row.first_name} ${row.last_name}`.toUpperCase()
    : '— — —';
  const pts = row ? `${row.total}` : '0';
  return `
    <span class="sr-pos">${rank}º</span>
    <span class="sr-stand">${name}</span>
    <span class="sr-pts">${pts}</span>
  `;
}

function buildOverlayContent() {
  const board = cachedScore.leaderboard || [];
  const top5 = board.slice(0, 5);
  while (top5.length < 5) top5.push(null);

  const meIdx = board.findIndex(p => p.id === participant.id);
  const myRank = meIdx >= 0 ? meIdx + 1 : null;
  const myTotal = meIdx >= 0 ? board[meIdx].total : 0;

  const subtitle = document.getElementById('scoreName');
  subtitle.textContent = myRank
    ? `TU LUGAR · ${myRank}º DE ${board.length}`
    : 'SIN PUNTOS AÚN';

  const list = document.getElementById('scoreList');
  list.innerHTML = '';
  top5.forEach((row, idx) => {
    const rank = idx + 1;
    const div = document.createElement('div');
    const classes = ['score3d-row'];
    if (!row) classes.push('empty');
    if (row && row.id === participant.id) classes.push('is-me');
    div.className = classes.join(' ');
    div.innerHTML = rowHTML(rank, row, row && row.id === participant.id);
    list.appendChild(div);
  });

  if (meIdx >= 5) {
    const sep = document.createElement('div');
    sep.className = 'score3d-divider';
    sep.textContent = '· · ·';
    list.appendChild(sep);
    const div = document.createElement('div');
    div.className = 'score3d-row is-me';
    div.innerHTML = rowHTML(meIdx + 1, board[meIdx], true);
    list.appendChild(div);
  }

  return myTotal;
}

function renderScoreOverlay() {
  const myTotal = buildOverlayContent();
  scoreOverlay.classList.add('show');

  const totalEl = document.getElementById('scoreTotal');
  const counter = { v: 0 };
  totalEl.textContent = '000';

  anime({
    targets: '.score3d-row',
    opacity: [0, 1],
    translateX: [-20, 0],
    duration: 380,
    delay: anime.stagger(110, { start: 250 }),
    easing: 'easeOutQuad',
  });
  anime({
    targets: counter,
    v: myTotal,
    round: 1,
    duration: 1400,
    delay: 350,
    easing: 'easeOutCubic',
    update: () => { totalEl.textContent = String(counter.v).padStart(3, '0'); },
  });
  anime({
    targets: '.score3d-title',
    scale: [0.6, 1],
    opacity: [0, 1],
    duration: 600,
    easing: 'easeOutBack',
  });
}

function softRefreshOverlay() {
  const myTotal = buildOverlayContent();
  document.querySelectorAll('.score3d-row').forEach(el => { el.style.opacity = 1; });
  document.getElementById('scoreTotal').textContent = String(myTotal).padStart(3, '0');
  const frame = document.querySelector('.score3d-frame');
  if (frame) {
    frame.classList.remove('pulse');
    void frame.offsetWidth;
    frame.classList.add('pulse');
  }
}

function zoomOut() {
  if (mode !== 'zoom') return;
  scoreOverlay.classList.remove('show');
  cachedScore = null;

  anime({
    targets: player.pos,
    x: savedCam.pos.x, y: savedCam.pos.y, z: savedCam.pos.z,
    duration: 900,
    easing: 'easeInOutCubic',
  });
  anime({
    targets: camState,
    yaw: savedCam.yaw, pitch: savedCam.pitch,
    duration: 900,
    easing: 'easeInOutCubic',
    complete: () => {
      mode = 'roam';
      if (!IS_TOUCH) lockHint.classList.remove('hidden');
    },
  });
}

/* =========================================================
   LOOP
   ========================================================= */
function nearCabinet() {
  const dx = player.pos.x - CAB_POS.x;
  const dz = player.pos.z - CAB_POS.z;
  if (dz < 0.6) return false;
  if (Math.abs(dx) > 1.8) return false;
  return Math.hypot(dx, dz) < INTERACT_RADIUS;
}

function clampToRoom(v) {
  const m = 0.5;
  v.x = Math.max(-ROOM.w/2 + m, Math.min(ROOM.w/2 - m, v.x));
  v.z = Math.max(-ROOM.d/2 + m, Math.min(ROOM.d/2 - m, v.z));
}

function tickPlayer(dt) {
  if (mode !== 'roam') return;
  const speed = 5.0;
  let fwd = 0, str = 0;
  if (IS_TOUCH) {
    fwd = -moveAnalogY;
    str =  moveAnalogX;
  } else {
    if (move.f) fwd += 1;
    if (move.b) fwd -= 1;
    if (move.r) str += 1;
    if (move.l) str -= 1;
  }
  const len = Math.hypot(fwd, str) || 1;
  fwd /= len; str /= len;

  const sinY = Math.sin(camState.yaw), cosY = Math.cos(camState.yaw);
  const dx = (sinY * -fwd + cosY * str) * speed * dt;
  const dz = (cosY * -fwd - sinY * str) * speed * dt;

  player.pos.x += dx;
  player.pos.z += dz;

  // Evitar atravesar el cabinet
  const dist = Math.hypot(player.pos.x - CAB_POS.x, player.pos.z - CAB_POS.z);
  if (dist < 1.5) {
    const ang = Math.atan2(player.pos.z - CAB_POS.z, player.pos.x - CAB_POS.x);
    player.pos.x = CAB_POS.x + Math.cos(ang) * 1.5;
    player.pos.z = CAB_POS.z + Math.sin(ang) * 1.5;
  }
  clampToRoom(player.pos);
}

function updateCamera() {
  camera.position.copy(player.pos);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = camState.yaw;
  camera.rotation.x = camState.pitch;
}

function updateInteractPrompt() {
  const show = mode === 'roam' && (isLocked || IS_TOUCH) && nearCabinet();
  interactPrompt.classList.toggle('show', show);
}

function updateParticles(t) {
  if (!particles) return;
  const pos = particles.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.array[i*3+1] += Math.sin(t * 0.5 + i) * 0.002;
    if (pos.array[i*3+1] > ROOM.h) pos.array[i*3+1] = 0;
  }
  pos.needsUpdate = true;
  particles.rotation.y = t * 0.02;
}

const clock = new THREE.Clock();
let elapsed = 0;
function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;
  tickPlayer(dt);
  updateCamera();
  updateInteractPrompt();
  updateParticles(elapsed);
  updateNpcs(elapsed);
  updateDecorScreens(elapsed);
  updateDynamicLights(elapsed);
  if (mainMarquee) drawMainMarquee(elapsed);
  if (mode === 'roam') drawScreenAttract(elapsed);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

/* =========================================================
   BOOT & ROUTING
   ========================================================= */

function init3D() {
  CAB_POS = new THREE.Vector3(0, 0, 0);
  canvas = document.getElementById('three');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(PALETTE.bg);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.bg, 8, 22);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 100);
  camera.position.set(0, 1.6, 2.8);

  window.addEventListener('resize', () => {
    if (renderer && camera) {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }
  });

  buildRoom();
  buildCabinet();
  buildArcadeHall();
  buildSodaFountain();
  buildDecor();
  buildUixFrames();
  buildNpcs();
  buildSodaNpcs();
  buildDynamicLights();

  // Event Listeners de 3D
  canvas.addEventListener('click', () => {
    if (mode === 'zoom') return;
    if (!musicEnabled) startMusic();
    if (!isLocked) lock();
  });

  document.addEventListener('pointerlockchange', () => {
    isLocked = document.pointerLockElement === canvas;
    document.body.classList.toggle('locked', isLocked);
    lockHint.classList.toggle('hidden', isLocked || mode === 'zoom');
    hudTip.textContent = isLocked
      ? 'WASD MOVERSE · MOUSE MIRAR · E INTERACTUAR'
      : 'CLICK PARA EXPLORAR';
  });

  // Listener para descartar el lockHint recurrente y asegurar juego en móvil
  lockHint.addEventListener('click', () => {
    lockHint.classList.add('hidden');
    document.body.classList.add('unlocked'); // revela el botón VER MI SCORE
    if (!musicEnabled) startMusic();
    if (IS_TOUCH) {
      const tip = document.getElementById('hudTip');
      if (tip) tip.textContent = 'JOYSTICK · MIRA · BOTÓN E';
    } else {
      lock();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!isLocked || mode !== 'roam') return;
    camState.yaw   -= e.movementX * 0.0025;
    camState.pitch -= e.movementY * 0.0025;
    const lim = Math.PI / 2 - 0.05;
    camState.pitch = Math.max(-lim, Math.min(lim, camState.pitch));
  });

  document.addEventListener('keydown', (e) => {
    if (mode === 'zoom') {
      if (e.code === 'Escape') zoomOut();
      return;
    }
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    move.f = true; break;
      case 'KeyS': case 'ArrowDown':  move.b = true; break;
      case 'KeyA': case 'ArrowLeft':  move.l = true; break;
      case 'KeyD': case 'ArrowRight': move.r = true; break;
      case 'KeyE': case 'Space':
        e.preventDefault();
        if (nearCabinet()) zoomIn();
        break;
    }
  });

  document.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    move.f = false; break;
      case 'KeyS': case 'ArrowDown':  move.b = false; break;
      case 'KeyA': case 'ArrowLeft':  move.l = false; break;
      case 'KeyD': case 'ArrowRight': move.r = false; break;
    }
  });

  document.getElementById('scoreBack').addEventListener('click', zoomOut);

  document.getElementById('musicBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMusic();
  });

  // Configuración de controles táctiles en caso de pantallas móviles
  if (IS_TOUCH) {
    setupTouch();
  }

  // Cablear el botón flotante de piloto automático ("VER MI SCORE")
  const mobileEasyBtn = document.getElementById('mobileEasyBtn');
  if (mobileEasyBtn) {
    mobileEasyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (mode === 'roam') zoomIn();
    });
  }

  loop();
}

// INICIALIZACIÓN UNIVERSAL EN 3D
init3D();
