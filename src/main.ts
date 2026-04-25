// Super Ginger — Kitty Rescue
// A tiny, peaceful canvas game for very small humans.
// Controls: arrow keys (or WASD). Catch up to the wandering kittens to rescue them.

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const scoreEl = document.getElementById("score")!;

const W = canvas.width;
const H = canvas.height;
const TILE = 64;

type Vec = { x: number; y: number };

type Hero = Vec & {
  vx: number;
  vy: number;
  facing: 1 | -1;
  bounce: number; // visual bob phase
};

type Kitten = Vec & {
  vx: number;
  vy: number;
  color: string;
  saved: boolean;
  wiggle: number;
  // How long until the kitten picks a new wander direction.
  wanderTimer: number;
  // Held in place by the hero's gravity pulse this frame.
  held: boolean;
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

const hero: Hero = {
  x: W / 2,
  y: H / 2,
  vx: 0,
  vy: 0,
  facing: 1,
  bounce: 0,
};

const KITTEN_COLORS = ["#fff4d6", "#cdb6ff", "#b6f0ff", "#ffd6e8", "#d6ffc7", "#ffe0a3"];
const PARTICLE_COLORS = ["#ff7ab8", "#ffb3d9", "#ffd166", "#fff3a3", "#b39dff", "#a8e6ff"];

const kittens: Kitten[] = [];
const particles: Particle[] = [];

let score = 0;

const COLS = Math.floor(W / TILE);
const ROWS = Math.floor(H / TILE);
// 0 = grass (walkable), 1 = building (blocked), 2 = path (walkable, decorative)
const map: number[][] = [];

function buildCity(): void {
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < COLS; c++) {
      row.push(0);
    }
    map.push(row);
  }
  // Decorative paths in a soft grid (no longer roads — just stone paths through the park).
  const hPaths = [2, 7];
  for (const r of hPaths) {
    for (let c = 0; c < COLS; c++) map[r][c] = 2;
  }
  const vPaths = [3, 11];
  for (const c of vPaths) {
    for (let r = 0; r < ROWS; r++) map[r][c] = 2;
  }
  // Cottage blocks. Slightly fewer/smaller so kittens have more room to wander.
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
    if (Math.hypot(x - hero.x, y - hero.y) < 140) continue;
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
window.addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
  if (
    [
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
      " ",
    ].includes(e.key.toLowerCase())
  ) {
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function inputDir(): Vec {
  let dx = 0;
  let dy = 0;
  if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
  if (keys.has("arrowright") || keys.has("d")) dx += 1;
  if (keys.has("arrowup") || keys.has("w")) dy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) dy += 1;
  if (dx !== 0 && dy !== 0) {
    const k = Math.SQRT1_2;
    dx *= k;
    dy *= k;
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

// Sustained gravity-beam hum: low sawtooth + sine harmonic, gain modulated by a 6Hz LFO.
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
    // Low-pass to round off any harshness.
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

// --- Update --------------------------------------------------------------

const HERO_SPEED = 3.4;
const HERO_RADIUS = 22;
const KITTEN_SPEED = 1.3; // markedly slower than the hero so the chase always succeeds
const KITTEN_RADIUS = 22;
const PULSE_RANGE = TILE * 3.2; // hero's gravity pulse: nearest kitten within this range freezes

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

function update(): void {
  // Hero movement.
  const want = inputDir();
  const targetVx = want.x * HERO_SPEED;
  const targetVy = want.y * HERO_SPEED;
  hero.vx += (targetVx - hero.vx) * 0.35;
  hero.vy += (targetVy - hero.vy) * 0.35;
  if (Math.abs(hero.vx) > 0.05) hero.facing = hero.vx > 0 ? 1 : -1;

  // Hero clips through buildings — only the screen edges stop her.
  hero.x = Math.max(HERO_RADIUS, Math.min(W - HERO_RADIUS, hero.x + hero.vx));
  hero.y = Math.max(HERO_RADIUS, Math.min(H - HERO_RADIUS, hero.y + hero.vy));
  hero.bounce += Math.hypot(hero.vx, hero.vy) * 0.08;

  // The hero's gravity pulse only locks onto the single nearest kitten in range.
  let lockedTarget: Kitten | null = null;
  let lockedDist = PULSE_RANGE;
  for (const k of kittens) {
    if (k.saved) continue;
    const d = Math.hypot(k.x - hero.x, k.y - hero.y);
    if (d < lockedDist) {
      lockedDist = d;
      lockedTarget = k;
    }
  }
  if (lockedTarget) startBeamSound();
  else stopBeamSound();

  // Kittens wander — unless they're the one caught in the hero's gravity pulse.
  for (const k of kittens) {
    if (k.saved) continue;
    k.wiggle += 0.12;
    k.held = k === lockedTarget;
    if (k.held) {
      k.vx = 0;
      k.vy = 0;
      // Reset wander timer so they pick a fresh direction the moment they're released.
      k.wanderTimer = 0;
      continue;
    }
    k.wanderTimer--;
    if (k.wanderTimer <= 0) {
      // Pick a new direction. 25% chance to pause briefly.
      if (Math.random() < 0.25) {
        k.vx = 0;
        k.vy = 0;
        k.wanderTimer = 30 + Math.random() * 40;
      } else {
        // Tend to flee gently from the hero so chasing feels real,
        // but mostly random so they don't all stream the same way.
        const dx = k.x - hero.x;
        const dy = k.y - hero.y;
        const dist = Math.hypot(dx, dy) || 1;
        const fleeWeight = dist < 220 ? 0.6 : 0.15;
        const rx = Math.random() * 2 - 1;
        const ry = Math.random() * 2 - 1;
        const dirX = (dx / dist) * fleeWeight + rx * (1 - fleeWeight);
        const dirY = (dy / dist) * fleeWeight + ry * (1 - fleeWeight);
        const dl = Math.hypot(dirX, dirY) || 1;
        k.vx = (dirX / dl) * KITTEN_SPEED;
        k.vy = (dirY / dl) * KITTEN_SPEED;
        k.wanderTimer = 60 + Math.random() * 90;
      }
    }
    const km = moveWithCollision(k, k.vx, k.vy, KITTEN_RADIUS);
    if (km.vx === 0 && k.vx !== 0) k.wanderTimer = 0; // bumped a wall, repick
    if (km.vy === 0 && k.vy !== 0) k.wanderTimer = 0;
    k.x = km.x;
    k.y = km.y;
    k.vx = km.vx;
    k.vy = km.vy;
  }

  // Rescue check.
  for (const k of kittens) {
    if (k.saved) continue;
    if (Math.hypot(k.x - hero.x, k.y - hero.y) < HERO_RADIUS + KITTEN_RADIUS - 8) {
      k.saved = true;
      score++;
      scoreEl.textContent = String(score);
      rescueChime();
      emitRescueBurst(k.x, k.y);
      if (kittens.every((kk) => kk.saved)) {
        winFanfare();
        setTimeout(resetRound, 1400);
      }
    }
  }

  // Particles drift gently UPWARD — light, floaty, celebratory.
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += -0.02; // negative gravity = float up
    p.vx *= 0.99;
    p.vy *= 0.99;
    p.rot += p.vrot;
    p.life--;
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
}

function emitRescueBurst(x: number, y: number): void {
  // Floating hearts.
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
    const speed = 1 + Math.random() * 1.2;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      life: 90,
      maxLife: 90,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.08,
      scale: 0.8 + Math.random() * 0.6,
      kind: "heart",
      color: PARTICLE_COLORS[Math.floor(Math.random() * 3)], // pinks/yellows
    });
  }
  // Stars.
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.6 + Math.random() * 1.6;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.6,
      life: 70,
      maxLife: 70,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.18,
      scale: 0.7 + Math.random() * 0.7,
      kind: "star",
      color: PARTICLE_COLORS[3 + Math.floor(Math.random() * 3)],
    });
  }
  // Tiny sparkle dots.
  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.4 + Math.random() * 2;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.4,
      life: 50,
      maxLife: 50,
      rot: 0,
      vrot: 0,
      scale: 0.5 + Math.random() * 0.6,
      kind: "sparkle",
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    });
  }
}

function resetRound(): void {
  kittens.length = 0;
  spawnKittens();
}

// --- Render --------------------------------------------------------------

function drawCity(): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = map[r][c];
      const x = c * TILE;
      const y = r * TILE;
      if (t === 0) {
        ctx.fillStyle = (r + c) % 2 === 0 ? "#9be29b" : "#84d488";
        ctx.fillRect(x, y, TILE, TILE);
        // tiny flower dots
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
        // Soft stone path instead of dark road.
        ctx.fillStyle = "#e9dec1";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "#d6c79f";
        ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
        ctx.fillStyle = "#f1ead2";
        ctx.fillRect(x + 10, y + 10, TILE - 20, TILE - 20);
      } else if (t === 1) {
        // Cottage with rounded top.
        const palette = ((r * 7 + c * 13) % 6);
        const colors = ["#e57aa8", "#f0a04b", "#7ec8ff", "#bba2ff", "#ffd166", "#86e3a3"];
        // base
        ctx.fillStyle = colors[palette];
        ctx.fillRect(x + 6, y + 16, TILE - 12, TILE - 22);
        // roof
        ctx.fillStyle = "#7a4f3a";
        ctx.beginPath();
        ctx.moveTo(x + 2, y + 22);
        ctx.lineTo(x + TILE / 2, y + 4);
        ctx.lineTo(x + TILE - 2, y + 22);
        ctx.closePath();
        ctx.fill();
        // door
        ctx.fillStyle = "#5a3a2a";
        ctx.fillRect(x + TILE / 2 - 6, y + TILE - 18, 12, 12);
        // window
        ctx.fillStyle = "#fffbe6";
        ctx.fillRect(x + 12, y + 26, 12, 10);
        ctx.fillRect(x + TILE - 24, y + 26, 12, 10);
        // window cross
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

function drawHero(): void {
  ctx.save();
  ctx.translate(hero.x, hero.y);
  const bob = Math.sin(hero.bounce) * 2;
  ctx.translate(0, bob);
  ctx.scale(hero.facing, 1);

  // Cape.
  ctx.fillStyle = "#ff5fb0";
  ctx.beginPath();
  ctx.moveTo(-6, -8);
  ctx.lineTo(-26, 6);
  ctx.lineTo(-22, 22);
  ctx.lineTo(-4, 14);
  ctx.closePath();
  ctx.fill();

  // Body.
  ctx.fillStyle = "#ff9a3d";
  ctx.beginPath();
  ctx.ellipse(0, 6, 18, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Stripes.
  ctx.fillStyle = "rgba(180, 80, 0, 0.4)";
  ctx.fillRect(-12, 2, 4, 8);
  ctx.fillRect(-2, 0, 4, 10);
  ctx.fillRect(8, 4, 4, 6);

  // Heart emblem.
  ctx.fillStyle = "#ff3d8a";
  ctx.beginPath();
  ctx.arc(-3, 8, 3, 0, Math.PI * 2);
  ctx.arc(3, 8, 3, 0, Math.PI * 2);
  ctx.moveTo(-6, 9);
  ctx.lineTo(0, 15);
  ctx.lineTo(6, 9);
  ctx.closePath();
  ctx.fill();

  // Head.
  ctx.fillStyle = "#ffb066";
  ctx.beginPath();
  ctx.arc(0, -10, 16, 0, Math.PI * 2);
  ctx.fill();

  // Ears.
  ctx.fillStyle = "#ff9a3d";
  ctx.beginPath();
  ctx.moveTo(-14, -18);
  ctx.lineTo(-6, -28);
  ctx.lineTo(-4, -16);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, -18);
  ctx.lineTo(6, -28);
  ctx.lineTo(4, -16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ff8fc4";
  ctx.beginPath();
  ctx.moveTo(-11, -19);
  ctx.lineTo(-7, -24);
  ctx.lineTo(-6, -18);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(11, -19);
  ctx.lineTo(7, -24);
  ctx.lineTo(6, -18);
  ctx.closePath();
  ctx.fill();

  // Mask.
  ctx.fillStyle = "#ff3d8a";
  ctx.beginPath();
  ctx.moveTo(-13, -12);
  ctx.lineTo(13, -12);
  ctx.lineTo(11, -6);
  ctx.lineTo(2, -4);
  ctx.lineTo(-2, -4);
  ctx.lineTo(-11, -6);
  ctx.closePath();
  ctx.fill();

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

  ctx.fillStyle = "#ff3d8a";
  ctx.beginPath();
  ctx.moveTo(-2, -3);
  ctx.lineTo(2, -3);
  ctx.lineTo(0, -1);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#5a2200";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -1);
  ctx.quadraticCurveTo(-3, 2, -5, 0);
  ctx.moveTo(0, -1);
  ctx.quadraticCurveTo(3, 2, 5, 0);
  ctx.stroke();

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6, -2); ctx.lineTo(-14, -3);
  ctx.moveTo(-6, -1); ctx.lineTo(-14, 0);
  ctx.moveTo(6, -2); ctx.lineTo(14, -3);
  ctx.moveTo(6, -1); ctx.lineTo(14, 0);
  ctx.stroke();

  ctx.strokeStyle = "#ff9a3d";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-14, 8);
  ctx.quadraticCurveTo(-26, -4, -22, -16);
  ctx.stroke();

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
  const freq = 0.085; // wavelength along the beam
  const amp = 9;
  const steps = Math.max(24, Math.floor(dist / 3));

  // Soft outer halo down the spine of the beam.
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

  // Glowing helix — uses canvas shadow to bloom each strand in purple.
  ctx.shadowColor = "rgba(190, 110, 255, 0.95)";
  ctx.shadowBlur = 14;

  // Strand A.
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

  // Strand B — π out of phase, slightly different shade.
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

  // Bright nodes where the strands cross (sin = 0 → x*freq − t = nπ).
  const spacing = Math.PI / freq;
  let firstCross = ((t % Math.PI) / freq);
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

function drawKitten(k: Kitten): void {
  if (k.saved) return;

  // Gravity-pulse aura — only when held by the hero's pulse field.
  if (k.held) {
    const t = performance.now() / 700;
    // Two outward-traveling rings, offset by half a cycle.
    for (const offset of [0, 0.5]) {
      const phase = (t + offset) % 1;
      const radius = 22 + phase * 30;
      const alpha = (1 - phase) * 0.45;
      ctx.strokeStyle = `rgba(255, 122, 184, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(k.x, k.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Soft inner glow.
    const glow = ctx.createRadialGradient(k.x, k.y, 0, k.x, k.y, 30);
    glow.addColorStop(0, "rgba(255, 122, 184, 0.22)");
    glow.addColorStop(1, "rgba(255, 122, 184, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(k.x, k.y, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  // Face the way they're moving.
  const facing: 1 | -1 = k.vx < -0.05 ? -1 : 1;
  const bob = Math.sin(k.wiggle) * 2;
  ctx.translate(k.x, k.y + bob);
  ctx.scale(facing, 1);
  // Scale up — make the kittens prominent.
  ctx.scale(1.45, 1.45);

  // Body.
  ctx.fillStyle = k.color;
  ctx.beginPath();
  ctx.ellipse(0, 4, 14, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tail (curled up).
  ctx.strokeStyle = k.color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(11, 2);
  ctx.quadraticCurveTo(20, -4, 16, -10);
  ctx.stroke();
  // Head.
  ctx.fillStyle = k.color;
  ctx.beginPath();
  ctx.arc(0, -6, 11, 0, Math.PI * 2);
  ctx.fill();
  // Ears.
  ctx.beginPath();
  ctx.moveTo(-9, -12); ctx.lineTo(-4, -18); ctx.lineTo(-3, -10); ctx.closePath();
  ctx.moveTo(9, -12); ctx.lineTo(4, -18); ctx.lineTo(3, -10); ctx.closePath();
  ctx.fill();
  // Inner ear pink.
  ctx.fillStyle = "#ff9fc7";
  ctx.beginPath();
  ctx.moveTo(-7, -12); ctx.lineTo(-5, -16); ctx.lineTo(-4, -11); ctx.closePath();
  ctx.moveTo(7, -12); ctx.lineTo(5, -16); ctx.lineTo(4, -11); ctx.closePath();
  ctx.fill();
  // Eyes — big, sparkly.
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
  // Nose.
  ctx.fillStyle = "#ff7aa8";
  ctx.beginPath();
  ctx.moveTo(-1.5, -3);
  ctx.lineTo(1.5, -3);
  ctx.lineTo(0, -1.5);
  ctx.closePath();
  ctx.fill();
  // Smile.
  ctx.strokeStyle = "#5a2200";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -1.5);
  ctx.quadraticCurveTo(-2, 0, -3, -1);
  ctx.moveTo(0, -1.5);
  ctx.quadraticCurveTo(2, 0, 3, -1);
  ctx.stroke();
  // Whiskers.
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-4, -3); ctx.lineTo(-10, -3);
  ctx.moveTo(-4, -2); ctx.lineTo(-10, -1);
  ctx.moveTo(4, -3); ctx.lineTo(10, -3);
  ctx.moveTo(4, -2); ctx.lineTo(10, -1);
  ctx.stroke();

  ctx.restore();

  // Floating heart bubble above each kitten — friendlier than "!".
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
  // little highlight
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

function drawParticle(p: Particle): void {
  const a = Math.max(0, Math.min(1, p.life / p.maxLife));
  ctx.globalAlpha = a;
  if (p.kind === "heart") {
    drawHeart(p.x, p.y, p.rot, p.scale, p.color);
  } else if (p.kind === "star") {
    drawStar(p.x, p.y, p.rot, p.scale, p.color);
  } else {
    // sparkle dot
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5 * p.scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function render(): void {
  ctx.fillStyle = "#cfeeff";
  ctx.fillRect(0, 0, W, H);
  drawCity();

  // Beam to the held kitten (under the characters so endpoints sit on top).
  const held = kittens.find((k) => k.held && !k.saved);
  if (held) drawGravityBeam(hero, held);

  for (const k of kittens) drawKitten(k);
  drawHero();
  for (const p of particles) drawParticle(p);

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

// --- Loop ----------------------------------------------------------------

function frame(): void {
  update();
  render();
  requestAnimationFrame(frame);
}

buildCity();
spawnKittens();
frame();
