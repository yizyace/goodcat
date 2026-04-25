// Super Kitties — Kitty Rescue
// 1- or 2-player canvas game. Pick a hero, chase the wandering kittens, save them all.

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const scoreEl = document.getElementById("score")!;

const W = canvas.width;
const H = canvas.height;
const TILE = 64;

// --- Types ---------------------------------------------------------------

type Vec = { x: number; y: number };
type GameState = "mode-select" | "character-select" | "playing";

type Character = {
  id: string;
  name: string;
  fur: string;
  suit: string;
  mask: string;
  cape: string;
  emblem: string;
  innerEar: string;
  whisker: string;
};

type Controls = {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
};

type Kitten = Vec & {
  vx: number;
  vy: number;
  color: string;
  saved: boolean;
  wiggle: number;
  wanderTimer: number;
  held: boolean;
};

type Hero = Vec & {
  vx: number;
  vy: number;
  facing: 1 | -1;
  bounce: number;
  character: Character;
  controls: Controls;
  label: string;
  lockedTarget: Kitten | null;
};

type Particle = Vec & {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  rot: number;
  vrot: number;
  scale: number;
  kind: "heart" | "star" | "sparkle";
  color: string;
};

// --- Characters ----------------------------------------------------------

const CHARACTERS: Character[] = [
  {
    id: "sparks",
    name: "SPARKS",
    fur: "#ffe066",
    suit: "#7e57c2",
    mask: "#ffd54f",
    cape: "#5e35b1",
    emblem: "#ffd54f",
    innerEar: "#ffaecd",
    whisker: "rgba(0,0,0,0.45)",
  },
  {
    id: "ginny",
    name: "GINNY",
    fur: "#ffb066",
    suit: "#ec407a",
    mask: "#ff8fb1",
    cape: "#c2185b",
    emblem: "#ffffff",
    innerEar: "#ffaecd",
    whisker: "rgba(0,0,0,0.45)",
  },
  {
    id: "buddy",
    name: "BUDDY",
    fur: "#ffe0b3",
    suit: "#ff7043",
    mask: "#ff5722",
    cape: "#e64a19",
    emblem: "#ffeb3b",
    innerEar: "#ffaecd",
    whisker: "rgba(0,0,0,0.45)",
  },
  {
    id: "bitsy",
    name: "BITSY",
    fur: "#ffffff",
    suit: "#26c6da",
    mask: "#00acc1",
    cape: "#0097a7",
    emblem: "#ffffff",
    innerEar: "#ffaecd",
    whisker: "rgba(70,70,70,0.7)",
  },
];

const ARROW_CONTROLS: Controls = {
  up: ["arrowup"],
  down: ["arrowdown"],
  left: ["arrowleft"],
  right: ["arrowright"],
};
const WASD_CONTROLS: Controls = {
  up: ["w"],
  down: ["s"],
  left: ["a"],
  right: ["d"],
};

// --- State ---------------------------------------------------------------

let state: GameState = "mode-select";
let mode: 1 | 2 = 1;
let modeSelectIdx: 0 | 1 = 0;
let charSelectIdx = 0;
let charSelectingPlayer = 0;
let p1Char: Character | null = null;
let p2Char: Character | null = null;

const players: Hero[] = [];
const kittens: Kitten[] = [];
const particles: Particle[] = [];

const KITTEN_COLORS = ["#fff4d6", "#cdb6ff", "#b6f0ff", "#ffd6e8", "#d6ffc7", "#ffe0a3"];
const PARTICLE_COLORS = ["#ff7ab8", "#ffb3d9", "#ffd166", "#fff3a3", "#b39dff", "#a8e6ff"];

let score = 0;

// --- City map ------------------------------------------------------------

const COLS = Math.floor(W / TILE);
const ROWS = Math.floor(H / TILE);
const map: number[][] = [];

function buildCity(): void {
  map.length = 0;
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < COLS; c++) row.push(0);
    map.push(row);
  }
  const hPaths = [2, 7];
  for (const r of hPaths) for (let c = 0; c < COLS; c++) map[r][c] = 2;
  const vPaths = [3, 11];
  for (const c of vPaths) for (let r = 0; r < ROWS; r++) map[r][c] = 2;
  const blockSpots: Vec[] = [
    { x: 1, y: 0 }, { x: 6, y: 0 }, { x: 9, y: 0 }, { x: 13, y: 0 },
    { x: 0, y: 4 }, { x: 5, y: 4 }, { x: 8, y: 4 }, { x: 13, y: 4 },
    { x: 1, y: 9 }, { x: 5, y: 9 }, { x: 9, y: 9 }, { x: 13, y: 9 },
  ];
  for (const b of blockSpots) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const r = b.y + dy;
        const c = b.x + dx;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && map[r][c] === 0) {
          map[r][c] = 1;
        }
      }
    }
  }
}

function tileAt(x: number, y: number): number {
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return 1;
  return map[r][c];
}
function isBlocked(x: number, y: number): boolean {
  return tileAt(x, y) === 1;
}

function spawnKittens(): void {
  kittens.length = 0;
  const targets = 6;
  let placed = 0;
  let tries = 0;
  while (placed < targets && tries < 500) {
    tries++;
    const c = 1 + Math.floor(Math.random() * (COLS - 2));
    const r = 1 + Math.floor(Math.random() * (ROWS - 2));
    if (map[r][c] === 1) continue;
    const x = c * TILE + TILE / 2;
    const y = r * TILE + TILE / 2;
    if (players.some((p) => Math.hypot(p.x - x, p.y - y) < 140)) continue;
    if (kittens.some((k) => Math.hypot(k.x - x, k.y - y) < 110)) continue;
    kittens.push({
      x,
      y,
      vx: 0,
      vy: 0,
      color: KITTEN_COLORS[placed % KITTEN_COLORS.length],
      saved: false,
      wiggle: Math.random() * Math.PI * 2,
      wanderTimer: Math.random() * 60,
      held: false,
    });
    placed++;
  }
}

// --- Input ---------------------------------------------------------------

const keys = new Set<string>();
const justPressed = new Set<string>();
const GAME_KEYS = new Set([
  "arrowup", "arrowdown", "arrowleft", "arrowright",
  "w", "a", "s", "d",
  "enter", " ", "1", "2",
]);
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (!keys.has(k)) justPressed.add(k);
  keys.add(k);
  if (GAME_KEYS.has(k)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function consumeJust(key: string): boolean {
  if (justPressed.has(key)) {
    justPressed.delete(key);
    return true;
  }
  return false;
}
function clearJust(): void {
  justPressed.clear();
}

function inputForControls(c: Controls): Vec {
  let dx = 0;
  let dy = 0;
  if (c.up.some((k) => keys.has(k))) dy -= 1;
  if (c.down.some((k) => keys.has(k))) dy += 1;
  if (c.left.some((k) => keys.has(k))) dx -= 1;
  if (c.right.some((k) => keys.has(k))) dx += 1;
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }
  return { x: dx, y: dy };
}

// --- Audio ---------------------------------------------------------------

let audioCtx: AudioContext | null = null;
function audio(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}
function blip(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.08): void {
  try {
    const a = audio();
    if (a.state === "suspended") a.resume();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    g.gain.setValueAtTime(gain, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur);
  } catch {
    // best-effort
  }
}
function rescueChime(): void {
  blip(880, 0.12, "triangle", 0.1);
  setTimeout(() => blip(1320, 0.16, "triangle", 0.09), 80);
  setTimeout(() => blip(1760, 0.2, "triangle", 0.07), 180);
}
function winFanfare(): void {
  const notes = [523, 659, 784, 1047];
  notes.forEach((n, i) => setTimeout(() => blip(n, 0.18, "triangle", 0.1), i * 120));
}

let beamNodes:
  | { mainGain: GainNode; oscs: OscillatorNode[]; lfo: OscillatorNode }
  | null = null;
function startBeamSound(): void {
  if (beamNodes) return;
  try {
    const a = audio();
    if (a.state === "suspended") a.resume();
    const osc1 = a.createOscillator();
    osc1.type = "triangle";
    osc1.frequency.value = 110;
    const osc2 = a.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = 165;
    const filter = a.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    const mainGain = a.createGain();
    mainGain.gain.setValueAtTime(0, a.currentTime);
    mainGain.gain.linearRampToValueAtTime(0.012, a.currentTime + 0.15);
    const lfo = a.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 4;
    const lfoDepth = a.createGain();
    lfoDepth.gain.value = 0.005;
    lfo.connect(lfoDepth);
    lfoDepth.connect(mainGain.gain);
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(mainGain);
    mainGain.connect(a.destination);
    osc1.start();
    osc2.start();
    lfo.start();
    beamNodes = { mainGain, oscs: [osc1, osc2], lfo };
  } catch {
    // best-effort
  }
}
function stopBeamSound(): void {
  if (!beamNodes) return;
  try {
    const a = audio();
    const { mainGain, oscs, lfo } = beamNodes;
    mainGain.gain.cancelScheduledValues(a.currentTime);
    mainGain.gain.setValueAtTime(mainGain.gain.value, a.currentTime);
    mainGain.gain.linearRampToValueAtTime(0, a.currentTime + 0.12);
    for (const osc of oscs) osc.stop(a.currentTime + 0.14);
    lfo.stop(a.currentTime + 0.14);
  } catch {
    // best-effort
  }
  beamNodes = null;
}

// --- Game lifecycle ------------------------------------------------------

const HERO_SPEED = 3.4;
const HERO_RADIUS = 22;
const KITTEN_SPEED = 1.3;
const KITTEN_RADIUS = 22;
const PULSE_RANGE = TILE * 3.2;

function moveWithCollision(
  pos: Vec,
  vx: number,
  vy: number,
  radius: number,
): { x: number; y: number; vx: number; vy: number } {
  let { x, y } = pos;
  const r = radius * 0.6;
  const nextX = x + vx;
  const xClear =
    !isBlocked(nextX - r, y - r) &&
    !isBlocked(nextX + r, y - r) &&
    !isBlocked(nextX - r, y + r) &&
    !isBlocked(nextX + r, y + r) &&
    nextX > radius &&
    nextX < W - radius;
  if (xClear) x = nextX;
  else vx = 0;
  const nextY = y + vy;
  const yClear =
    !isBlocked(x - r, nextY - r) &&
    !isBlocked(x + r, nextY - r) &&
    !isBlocked(x - r, nextY + r) &&
    !isBlocked(x + r, nextY + r) &&
    nextY > radius &&
    nextY < H - radius;
  if (yClear) y = nextY;
  else vy = 0;
  return { x, y, vx, vy };
}

function startGame(): void {
  players.length = 0;
  const charsToUse: Character[] = mode === 1 ? [p1Char!] : [p1Char!, p2Char!];
  const startPositions: Vec[] = mode === 1
    ? [{ x: W / 2, y: H / 2 }]
    : [{ x: W * 0.32, y: H / 2 }, { x: W * 0.68, y: H / 2 }];
  for (let i = 0; i < charsToUse.length; i++) {
    players.push({
      x: startPositions[i].x,
      y: startPositions[i].y,
      vx: 0,
      vy: 0,
      facing: 1,
      bounce: 0,
      character: charsToUse[i],
      controls: i === 0 ? ARROW_CONTROLS : WASD_CONTROLS,
      label: `P${i + 1}`,
      lockedTarget: null,
    });
  }
  score = 0;
  scoreEl.textContent = "0";
  particles.length = 0;
  buildCity();
  spawnKittens();
  state = "playing";
}

// --- Update --------------------------------------------------------------

function update(): void {
  if (state === "mode-select") updateModeSelect();
  else if (state === "character-select") updateCharSelect();
  else updatePlaying();
  clearJust();
}

function updateModeSelect(): void {
  if (consumeJust("arrowleft") || consumeJust("a") || consumeJust("1")) {
    modeSelectIdx = 0;
  }
  if (consumeJust("arrowright") || consumeJust("d") || consumeJust("2")) {
    modeSelectIdx = 1;
  }
  if (consumeJust("enter") || consumeJust(" ")) {
    mode = modeSelectIdx === 0 ? 1 : 2;
    state = "character-select";
    charSelectingPlayer = 0;
    charSelectIdx = 0;
    p1Char = null;
    p2Char = null;
  }
}

function isCharTaken(idx: number): boolean {
  return charSelectingPlayer === 1 && p1Char === CHARACTERS[idx];
}

function updateCharSelect(): void {
  let dir = 0;
  if (consumeJust("arrowright") || consumeJust("d")) dir = 1;
  else if (consumeJust("arrowleft") || consumeJust("a")) dir = -1;
  if (dir !== 0) {
    let next = charSelectIdx;
    for (let i = 0; i < CHARACTERS.length; i++) {
      next = (next + dir + CHARACTERS.length) % CHARACTERS.length;
      if (!isCharTaken(next)) break;
    }
    charSelectIdx = next;
  }
  if (consumeJust("enter") || consumeJust(" ")) {
    if (isCharTaken(charSelectIdx)) return;
    if (charSelectingPlayer === 0) {
      p1Char = CHARACTERS[charSelectIdx];
      if (mode === 2) {
        charSelectingPlayer = 1;
        let next = (charSelectIdx + 1) % CHARACTERS.length;
        while (CHARACTERS[next] === p1Char) next = (next + 1) % CHARACTERS.length;
        charSelectIdx = next;
      } else {
        startGame();
      }
    } else {
      p2Char = CHARACTERS[charSelectIdx];
      startGame();
    }
  }
}

function updatePlaying(): void {
  // Per-player movement.
  for (const p of players) {
    const want = inputForControls(p.controls);
    const tvx = want.x * HERO_SPEED;
    const tvy = want.y * HERO_SPEED;
    p.vx += (tvx - p.vx) * 0.35;
    p.vy += (tvy - p.vy) * 0.35;
    if (Math.abs(p.vx) > 0.05) p.facing = p.vx > 0 ? 1 : -1;
    p.x = Math.max(HERO_RADIUS, Math.min(W - HERO_RADIUS, p.x + p.vx));
    p.y = Math.max(HERO_RADIUS, Math.min(H - HERO_RADIUS, p.y + p.vy));
    p.bounce += Math.hypot(p.vx, p.vy) * 0.08;
  }

  // Per-player gravity-pulse target lock.
  for (const p of players) {
    let target: Kitten | null = null;
    let dist = PULSE_RANGE;
    for (const k of kittens) {
      if (k.saved) continue;
      const d = Math.hypot(k.x - p.x, k.y - p.y);
      if (d < dist) {
        dist = d;
        target = k;
      }
    }
    p.lockedTarget = target;
  }
  for (const k of kittens) k.held = false;
  for (const p of players) if (p.lockedTarget) p.lockedTarget.held = true;

  if (players.some((p) => p.lockedTarget)) startBeamSound();
  else stopBeamSound();

  // Kitten wander + flee.
  for (const k of kittens) {
    if (k.saved) continue;
    k.wiggle += 0.12;
    if (k.held) {
      k.vx = 0;
      k.vy = 0;
      k.wanderTimer = 0;
      continue;
    }
    k.wanderTimer--;
    if (k.wanderTimer <= 0) {
      if (Math.random() < 0.25) {
        k.vx = 0;
        k.vy = 0;
        k.wanderTimer = 30 + Math.random() * 40;
      } else {
        // Flee from the nearest player.
        let nearest = players[0];
        let nd = Math.hypot(nearest.x - k.x, nearest.y - k.y);
        for (let i = 1; i < players.length; i++) {
          const d = Math.hypot(players[i].x - k.x, players[i].y - k.y);
          if (d < nd) {
            nd = d;
            nearest = players[i];
          }
        }
        const dx = k.x - nearest.x;
        const dy = k.y - nearest.y;
        const dl = Math.hypot(dx, dy) || 1;
        const fleeWeight = nd < 220 ? 0.6 : 0.15;
        const rx = Math.random() * 2 - 1;
        const ry = Math.random() * 2 - 1;
        const dirX = (dx / dl) * fleeWeight + rx * (1 - fleeWeight);
        const dirY = (dy / dl) * fleeWeight + ry * (1 - fleeWeight);
        const dl2 = Math.hypot(dirX, dirY) || 1;
        k.vx = (dirX / dl2) * KITTEN_SPEED;
        k.vy = (dirY / dl2) * KITTEN_SPEED;
        k.wanderTimer = 60 + Math.random() * 90;
      }
    }
    const km = moveWithCollision(k, k.vx, k.vy, KITTEN_RADIUS);
    if (km.vx === 0 && k.vx !== 0) k.wanderTimer = 0;
    if (km.vy === 0 && k.vy !== 0) k.wanderTimer = 0;
    k.x = km.x;
    k.y = km.y;
    k.vx = km.vx;
    k.vy = km.vy;
  }

  // Rescue: any player who touches a kitten saves it.
  for (const k of kittens) {
    if (k.saved) continue;
    for (const p of players) {
      if (Math.hypot(k.x - p.x, k.y - p.y) < HERO_RADIUS + KITTEN_RADIUS - 8) {
        k.saved = true;
        score++;
        scoreEl.textContent = String(score);
        rescueChime();
        emitRescueBurst(k.x, k.y);
        if (kittens.every((kk) => kk.saved)) {
          winFanfare();
          stopBeamSound();
          setTimeout(resetRound, 1400);
        }
        break;
      }
    }
  }

  // Particles.
  for (const pr of particles) {
    pr.x += pr.vx;
    pr.y += pr.vy;
    pr.vy += -0.02;
    pr.vx *= 0.99;
    pr.vy *= 0.99;
    pr.rot += pr.vrot;
    pr.life--;
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
}

function emitRescueBurst(x: number, y: number): void {
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
    const speed = 1 + Math.random() * 1.2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      life: 90, maxLife: 90,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.08,
      scale: 0.8 + Math.random() * 0.6,
      kind: "heart",
      color: PARTICLE_COLORS[Math.floor(Math.random() * 3)],
    });
  }
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.6 + Math.random() * 1.6;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.6,
      life: 70, maxLife: 70,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.18,
      scale: 0.7 + Math.random() * 0.7,
      kind: "star",
      color: PARTICLE_COLORS[3 + Math.floor(Math.random() * 3)],
    });
  }
  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.4 + Math.random() * 2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.4,
      life: 50, maxLife: 50,
      rot: 0, vrot: 0,
      scale: 0.5 + Math.random() * 0.6,
      kind: "sparkle",
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    });
  }
}

function resetRound(): void {
  spawnKittens();
}

// --- Render --------------------------------------------------------------

function render(): void {
  if (state === "mode-select") renderModeSelect();
  else if (state === "character-select") renderCharSelect();
  else renderPlaying();
}

function drawTitleBackground(): void {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#1d1556");
  grad.addColorStop(1, "#46226a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // drifting sparkles
  for (let i = 0; i < 60; i++) {
    const x = ((i * 137 + performance.now() / 50) % W + W) % W;
    const y = (i * 89) % H;
    ctx.fillStyle = `rgba(255,255,255,${0.15 + (i % 3) * 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function roundRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function renderModeSelect(): void {
  drawTitleBackground();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#fff";
  ctx.font = "bold 64px system-ui";
  ctx.fillText("SUPER KITTIES", W / 2, 100);
  ctx.fillStyle = "#ffd0e8";
  ctx.font = "bold 28px system-ui";
  ctx.fillText("Kitty Rescue!", W / 2, 150);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 22px system-ui";
  ctx.fillText("How many players?", W / 2, 240);

  const optionsY = H / 2 + 40;
  const labels = ["1 PLAYER", "2 PLAYERS"];
  const xs = [W * 0.3, W * 0.7];
  for (let i = 0; i < 2; i++) {
    const selected = modeSelectIdx === i;
    const cx = xs[i];
    const cy = optionsY;
    ctx.fillStyle = selected ? "#ff5fb0" : "rgba(255,255,255,0.12)";
    roundRect(cx - 130, cy - 50, 260, 100, 16);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 36px system-ui";
    ctx.fillText(labels[i], cx, cy);
    if (selected) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 4;
      roundRect(cx - 130, cy - 50, 260, 100, 16);
      ctx.stroke();
    }
  }

  ctx.fillStyle = "#fff";
  ctx.font = "20px system-ui";
  ctx.fillText("← → to choose  ·  ENTER to continue", W / 2, H - 60);
}

function renderCharSelect(): void {
  drawTitleBackground();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#fff";
  ctx.font = "bold 36px system-ui";
  ctx.fillText(`PLAYER ${charSelectingPlayer + 1} — Choose your hero!`, W / 2, 70);

  const cardW = 180;
  const cardH = 280;
  const gap = 24;
  const totalW = cardW * 4 + gap * 3;
  const startX = (W - totalW) / 2;
  const cardY = (H - cardH) / 2 + 30;

  for (let i = 0; i < CHARACTERS.length; i++) {
    const c = CHARACTERS[i];
    const x = startX + i * (cardW + gap);
    const taken = isCharTaken(i);
    const selected = charSelectIdx === i;

    ctx.fillStyle = taken ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.12)";
    roundRect(x, cardY, cardW, cardH, 14);
    ctx.fill();

    if (selected) {
      ctx.shadowColor = "rgba(255, 213, 79, 0.95)";
      ctx.shadowBlur = 22;
      ctx.strokeStyle = "#ffd54f";
      ctx.lineWidth = 5;
      roundRect(x, cardY, cardW, cardH, 14);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = taken ? "#888" : c.suit;
    ctx.font = "bold 30px system-ui";
    ctx.fillText(c.name, x + cardW / 2, cardY + 36);

    ctx.save();
    ctx.translate(x + cardW / 2, cardY + cardH / 2 + 30);
    ctx.scale(2.4, 2.4);
    if (taken) ctx.globalAlpha = 0.35;
    drawHeroBody(c, 1);
    ctx.globalAlpha = 1;
    ctx.restore();

    if (taken) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 22px system-ui";
      ctx.fillText("TAKEN", x + cardW / 2, cardY + cardH - 28);
    }
  }

  if (mode === 2 && p1Char) {
    ctx.fillStyle = "#ffd0e8";
    ctx.font = "20px system-ui";
    ctx.fillText(`P1 picked ${p1Char.name}`, W / 2, H - 100);
  }
  ctx.fillStyle = "#fff";
  ctx.font = "20px system-ui";
  ctx.fillText("← → to choose  ·  ENTER to lock in", W / 2, H - 50);
}

function renderPlaying(): void {
  ctx.fillStyle = "#cfeeff";
  ctx.fillRect(0, 0, W, H);
  drawCity();

  for (const p of players) {
    if (p.lockedTarget) drawGravityBeam(p, p.lockedTarget);
  }

  for (const k of kittens) drawKitten(k);
  for (const p of players) drawHero(p);
  for (const pr of particles) drawParticle(pr);

  if (mode === 2) {
    for (const p of players) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 14px system-ui";
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 4;
      ctx.strokeText(p.label, p.x, p.y - 50);
      ctx.fillStyle = "#fff";
      ctx.fillText(p.label, p.x, p.y - 50);
    }
  }

  if (kittens.length > 0 && kittens.every((k) => k.saved)) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, H / 2 - 60, W, 120);
    ctx.fillStyle = "#ffd0e8";
    ctx.font = "bold 56px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("All kitties saved!", W / 2, H / 2);
  }
}

// --- Drawing helpers -----------------------------------------------------

function drawCity(): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = map[r][c];
      const x = c * TILE;
      const y = r * TILE;
      if (t === 0) {
        ctx.fillStyle = (r + c) % 2 === 0 ? "#9be29b" : "#84d488";
        ctx.fillRect(x, y, TILE, TILE);
        if ((r * 3 + c * 5) % 7 === 0) {
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(x + 16, y + 22, 2, 0, Math.PI * 2);
          ctx.arc(x + 44, y + 48, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffd166";
          ctx.beginPath();
          ctx.arc(x + 30, y + 38, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (t === 2) {
        ctx.fillStyle = "#e9dec1";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "#d6c79f";
        ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
        ctx.fillStyle = "#f1ead2";
        ctx.fillRect(x + 10, y + 10, TILE - 20, TILE - 20);
      } else if (t === 1) {
        const palette = (r * 7 + c * 13) % 6;
        const colors = ["#e57aa8", "#f0a04b", "#7ec8ff", "#bba2ff", "#ffd166", "#86e3a3"];
        ctx.fillStyle = colors[palette];
        ctx.fillRect(x + 6, y + 16, TILE - 12, TILE - 22);
        ctx.fillStyle = "#7a4f3a";
        ctx.beginPath();
        ctx.moveTo(x + 2, y + 22);
        ctx.lineTo(x + TILE / 2, y + 4);
        ctx.lineTo(x + TILE - 2, y + 22);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#5a3a2a";
        ctx.fillRect(x + TILE / 2 - 6, y + TILE - 18, 12, 12);
        ctx.fillStyle = "#fffbe6";
        ctx.fillRect(x + 12, y + 26, 12, 10);
        ctx.fillRect(x + TILE - 24, y + 26, 12, 10);
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 18, y + 26); ctx.lineTo(x + 18, y + 36);
        ctx.moveTo(x + 12, y + 31); ctx.lineTo(x + 24, y + 31);
        ctx.moveTo(x + TILE - 18, y + 26); ctx.lineTo(x + TILE - 18, y + 36);
        ctx.moveTo(x + TILE - 24, y + 31); ctx.lineTo(x + TILE - 12, y + 31);
        ctx.stroke();
      }
    }
  }
}

// Draws the hero shape centered at the current ctx origin, no translate.
// Used by drawHero (in-game) and the character-select cards.
function drawHeroBody(c: Character, facing: 1 | -1, bobY = 0): void {
  ctx.save();
  ctx.translate(0, bobY);
  ctx.scale(facing, 1);

  // Cape.
  ctx.fillStyle = c.cape;
  ctx.beginPath();
  ctx.moveTo(-6, -8);
  ctx.lineTo(-26, 6);
  ctx.lineTo(-22, 22);
  ctx.lineTo(-4, 14);
  ctx.closePath();
  ctx.fill();

  // Body suit.
  ctx.fillStyle = c.suit;
  ctx.beginPath();
  ctx.ellipse(0, 6, 18, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belt accent.
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(-16, 12, 32, 3);

  // Heart emblem.
  ctx.fillStyle = c.emblem;
  ctx.beginPath();
  ctx.arc(-3, 6, 3, 0, Math.PI * 2);
  ctx.arc(3, 6, 3, 0, Math.PI * 2);
  ctx.moveTo(-6, 7);
  ctx.lineTo(0, 13);
  ctx.lineTo(6, 7);
  ctx.closePath();
  ctx.fill();

  // Head.
  ctx.fillStyle = c.fur;
  ctx.beginPath();
  ctx.arc(0, -10, 16, 0, Math.PI * 2);
  ctx.fill();

  // Ears outer.
  ctx.fillStyle = c.fur;
  ctx.beginPath();
  ctx.moveTo(-14, -18); ctx.lineTo(-6, -28); ctx.lineTo(-4, -16); ctx.closePath();
  ctx.moveTo(14, -18); ctx.lineTo(6, -28); ctx.lineTo(4, -16); ctx.closePath();
  ctx.fill();
  // Inner ear.
  ctx.fillStyle = c.innerEar;
  ctx.beginPath();
  ctx.moveTo(-11, -19); ctx.lineTo(-7, -24); ctx.lineTo(-6, -18); ctx.closePath();
  ctx.moveTo(11, -19); ctx.lineTo(7, -24); ctx.lineTo(6, -18); ctx.closePath();
  ctx.fill();

  // Mask.
  ctx.fillStyle = c.mask;
  ctx.beginPath();
  ctx.moveTo(-13, -12);
  ctx.lineTo(13, -12);
  ctx.lineTo(11, -6);
  ctx.lineTo(2, -4);
  ctx.lineTo(-2, -4);
  ctx.lineTo(-11, -6);
  ctx.closePath();
  ctx.fill();

  // Eyes.
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-6, -9, 2.4, 0, Math.PI * 2);
  ctx.arc(6, -9, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(-6, -9, 1.1, 0, Math.PI * 2);
  ctx.arc(6, -9, 1.1, 0, Math.PI * 2);
  ctx.fill();

  // Nose.
  ctx.fillStyle = "#ff3d8a";
  ctx.beginPath();
  ctx.moveTo(-2, -3);
  ctx.lineTo(2, -3);
  ctx.lineTo(0, -1);
  ctx.closePath();
  ctx.fill();

  // Mouth.
  ctx.strokeStyle = "#5a2200";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -1);
  ctx.quadraticCurveTo(-3, 2, -5, 0);
  ctx.moveTo(0, -1);
  ctx.quadraticCurveTo(3, 2, 5, 0);
  ctx.stroke();

  // Whiskers.
  ctx.strokeStyle = c.whisker;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6, -2); ctx.lineTo(-14, -3);
  ctx.moveTo(-6, -1); ctx.lineTo(-14, 0);
  ctx.moveTo(6, -2); ctx.lineTo(14, -3);
  ctx.moveTo(6, -1); ctx.lineTo(14, 0);
  ctx.stroke();

  // Tail.
  ctx.strokeStyle = c.fur;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-14, 8);
  ctx.quadraticCurveTo(-26, -4, -22, -16);
  ctx.stroke();

  ctx.restore();
}

function drawHero(h: Hero): void {
  ctx.save();
  ctx.translate(h.x, h.y);
  drawHeroBody(h.character, h.facing, Math.sin(h.bounce) * 2);
  ctx.restore();
}

function drawKitten(k: Kitten): void {
  if (k.saved) return;

  // Gravity-pulse aura.
  if (k.held) {
    const t = performance.now() / 700;
    for (const offset of [0, 0.5]) {
      const phase = (t + offset) % 1;
      const radius = 22 + phase * 30;
      const alpha = (1 - phase) * 0.45;
      ctx.strokeStyle = `rgba(190, 110, 255, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(k.x, k.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(k.x, k.y, 0, k.x, k.y, 30);
    glow.addColorStop(0, "rgba(190, 110, 255, 0.22)");
    glow.addColorStop(1, "rgba(190, 110, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(k.x, k.y, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  const facing: 1 | -1 = k.vx < -0.05 ? -1 : 1;
  const bob = Math.sin(k.wiggle) * 2;
  ctx.translate(k.x, k.y + bob);
  ctx.scale(facing, 1);
  ctx.scale(1.45, 1.45);

  ctx.fillStyle = k.color;
  ctx.beginPath();
  ctx.ellipse(0, 4, 14, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = k.color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(11, 2);
  ctx.quadraticCurveTo(20, -4, 16, -10);
  ctx.stroke();
  ctx.fillStyle = k.color;
  ctx.beginPath();
  ctx.arc(0, -6, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-9, -12); ctx.lineTo(-4, -18); ctx.lineTo(-3, -10); ctx.closePath();
  ctx.moveTo(9, -12); ctx.lineTo(4, -18); ctx.lineTo(3, -10); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ff9fc7";
  ctx.beginPath();
  ctx.moveTo(-7, -12); ctx.lineTo(-5, -16); ctx.lineTo(-4, -11); ctx.closePath();
  ctx.moveTo(7, -12); ctx.lineTo(5, -16); ctx.lineTo(4, -11); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(-4, -6, 2.2, 0, Math.PI * 2);
  ctx.arc(4, -6, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-3.2, -6.8, 0.8, 0, Math.PI * 2);
  ctx.arc(4.8, -6.8, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff7aa8";
  ctx.beginPath();
  ctx.moveTo(-1.5, -3);
  ctx.lineTo(1.5, -3);
  ctx.lineTo(0, -1.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#5a2200";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -1.5);
  ctx.quadraticCurveTo(-2, 0, -3, -1);
  ctx.moveTo(0, -1.5);
  ctx.quadraticCurveTo(2, 0, 3, -1);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-4, -3); ctx.lineTo(-10, -3);
  ctx.moveTo(-4, -2); ctx.lineTo(-10, -1);
  ctx.moveTo(4, -3); ctx.lineTo(10, -3);
  ctx.moveTo(4, -2); ctx.lineTo(10, -1);
  ctx.stroke();

  ctx.restore();

  ctx.save();
  ctx.translate(k.x + 18, k.y - 28 + Math.sin(k.wiggle * 1.2) * 2);
  drawHeart(0, 0, 0, 0.55, "#ff7ab8");
  ctx.restore();
}

function drawHeart(x: number, y: number, rot: number, scale: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.bezierCurveTo(-12, -6, -8, -14, 0, -8);
  ctx.bezierCurveTo(8, -14, 12, -6, 0, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath();
  ctx.ellipse(-3, -6, 1.6, 2.2, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStar(x: number, y: number, rot: number, scale: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10 - Math.PI / 2;
    const r = i % 2 === 0 ? 7 : 3;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGravityBeam(from: Vec, to: Vec): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  const angle = Math.atan2(dy, dx);

  ctx.save();
  ctx.translate(from.x, from.y);
  ctx.rotate(angle);

  const t = performance.now() / 180;
  const freq = 0.085;
  const amp = 9;
  const steps = Math.max(24, Math.floor(dist / 3));

  const halo = ctx.createLinearGradient(0, 0, dist, 0);
  halo.addColorStop(0.0, "rgba(170, 110, 255, 0.0)");
  halo.addColorStop(0.2, "rgba(170, 110, 255, 0.35)");
  halo.addColorStop(0.8, "rgba(170, 110, 255, 0.35)");
  halo.addColorStop(1.0, "rgba(170, 110, 255, 0.0)");
  ctx.strokeStyle = halo;
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(dist, 0);
  ctx.stroke();

  ctx.shadowColor = "rgba(190, 110, 255, 0.95)";
  ctx.shadowBlur = 14;

  ctx.strokeStyle = "rgba(214, 168, 255, 0.95)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * dist;
    const y = Math.sin(x * freq - t) * amp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(168, 110, 240, 0.95)";
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * dist;
    const y = Math.sin(x * freq - t + Math.PI) * amp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.shadowBlur = 0;

  const spacing = Math.PI / freq;
  let firstCross = (t % Math.PI) / freq;
  if (firstCross < 0) firstCross += spacing;
  for (let x = firstCross; x < dist; x += spacing) {
    const pulse = 0.7 + Math.sin(t * 3 + x * 0.05) * 0.3;
    ctx.fillStyle = `rgba(240, 215, 255, ${pulse})`;
    ctx.beginPath();
    ctx.arc(x, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawParticle(p: Particle): void {
  const a = Math.max(0, Math.min(1, p.life / p.maxLife));
  ctx.globalAlpha = a;
  if (p.kind === "heart") drawHeart(p.x, p.y, p.rot, p.scale, p.color);
  else if (p.kind === "star") drawStar(p.x, p.y, p.rot, p.scale, p.color);
  else {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5 * p.scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --- Loop ----------------------------------------------------------------

function frame(): void {
  update();
  render();
  requestAnimationFrame(frame);
}

frame();
