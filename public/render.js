// buildbeat visual layer: a full-bleed brutalist build-monitor. The giant mood
// word is carved live by the audio spectrum; a ballistic VU meter and an
// oscilloscope guarantee the frame is always moving. Reads the shared `state`
// from engine.js (audio + websocket); never touches the audio.

import { state } from "./engine.js";

const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const RAMP = " .:-=+*#";
const BG = "#07090c";
const GRID = "#161c24";
const SUBGRID = "#0e141b";
const DIM = "#5a6675";
const CHROME = "#8492a0";
const WHITE = "#eaf0f2";
const PHOSPHOR = "#9dff4f";

// 5x7 block bitmaps for the letters in CALM / FOCUS / TENSE / FAIL.
const GLYPHS = {
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  N: ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
};

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
let W = 0;
let H = 0;
let dpr = 1;
const stat = document.createElement("canvas");
const sctx = stat.getContext("2d");

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  for (const c of [canvas, stat]) {
    c.width = Math.floor(W * dpr);
    c.height = Math.floor(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildStatic();
}

// Static layer (bezel, grid, vignette, scanlines) drawn once per resize, blitted each frame.
function buildStatic() {
  const m = 18;
  sctx.clearRect(0, 0, W, H);
  sctx.fillStyle = BG;
  sctx.fillRect(0, 0, W, H);
  // 12-column vertical grid + a few horizontal rules
  sctx.lineWidth = 1;
  sctx.strokeStyle = SUBGRID;
  for (let i = 1; i < 12; i++) {
    const x = m + ((W - 2 * m) * i) / 12;
    sctx.beginPath();
    sctx.moveTo(Math.round(x) + 0.5, m);
    sctx.lineTo(Math.round(x) + 0.5, H - m);
    sctx.stroke();
  }
  sctx.strokeStyle = GRID;
  for (const fr of [0.08, 0.15, 0.71, 0.87]) {
    const y = Math.round(m + (H - 2 * m) * fr) + 0.5;
    sctx.beginPath();
    sctx.moveTo(m, y);
    sctx.lineTo(W - m, y);
    sctx.stroke();
  }
  // bezel
  sctx.strokeStyle = GRID;
  sctx.strokeRect(m + 0.5, m + 0.5, W - 2 * m - 1, H - 2 * m - 1);
  // scanlines
  sctx.fillStyle = "rgba(0,0,0,0.22)";
  for (let y = 0; y < H; y += 3) sctx.fillRect(0, y, W, 1);
  // vignette
  const vg = sctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  sctx.fillStyle = vg;
  sctx.fillRect(0, 0, W, H);
}

// ---- color ----
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function moodHue(t) {
  if (t < 0.15) return 168;
  if (t < 0.45) return lerp(168, 42, (t - 0.15) / 0.3);
  if (t < 0.8) return lerp(42, 16, (t - 0.45) / 0.35);
  return ((16 - 22 * ((t - 0.8) / 0.2)) % 360 + 360) % 360;
}
function accent(t, lOff = 0) {
  return `hsl(${moodHue(t)} ${60 + 40 * t}% ${62 + 8 * t + lOff}%)`;
}

// ---- audio buffers + meters ----
let freq = null;
let time = null;
let runMax = 16;
let vuPos = 0;
let vuVel = 0;
let scan = 0;

function ensureBuffers() {
  if (state.analyser && !freq) {
    freq = new Uint8Array(state.analyser.frequencyBinCount);
    time = new Uint8Array(state.analyser.fftSize);
  }
}

function columnEnergy(c, cols, now) {
  const half = Math.floor(freq.length * 0.5);
  const bin = Math.min(half - 1, Math.max(1, Math.floor(half ** (c / cols))));
  let e = freq[bin] / (runMax + 1);
  e = Math.max(e, 0.12 + 0.05 * Math.sin(now * 0.002 + c * 0.4));
  return Math.min(1, e * 1.08);
}

function wordCols(word) {
  const cols = [];
  const letters = word.split("").filter((ch) => GLYPHS[ch]);
  letters.forEach((ch, li) => {
    const g = GLYPHS[ch];
    for (let c = 0; c < 5; c++) {
      const col = [];
      for (let r = 0; r < 7; r++) col.push(g[r][c] === "#");
      cols.push(col);
    }
    if (li < letters.length - 1) cols.push([false, false, false, false, false, false, false]);
  });
  return cols;
}

// ---- text helpers ----
function text(s, x, y, size, color, weight = 400, spacing = 0, align = "left") {
  ctx.font = `${weight} ${size}px ${MONO}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  if (spacing) {
    ctx.save();
    let cx = x;
    if (align === "right") cx = x - measure(s, size, weight, spacing);
    else if (align === "center") cx = x - measure(s, size, weight, spacing) / 2;
    ctx.textAlign = "left";
    for (const ch of s) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + spacing;
    }
    ctx.restore();
  } else {
    ctx.fillText(s, x, y);
  }
}
function measure(s, size, weight, spacing) {
  ctx.font = `${weight} ${size}px ${MONO}`;
  let w = 0;
  for (const ch of s) w += ctx.measureText(ch).width + spacing;
  return w;
}
function clk(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}

// ---- frame ----
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const m = 18;

  // ease + decay
  state.tEased += (state.tensionTarget - state.tEased) * 0.08;
  state.accentKick *= 0.9;
  if (state.failTear > 0) state.failTear -= 1;
  state.shake *= 0.86;
  state.invert *= 0.82;
  if (state.greenSweep > 0) state.greenSweep = Math.min(1.2, state.greenSweep + 0.05);
  if (state.greenSweep >= 1.2) state.greenSweep = 0;
  state.commitLock *= 0.965;
  scan = (scan + 0.4) % 3;

  ensureBuffers();
  if (freq && state.analyser) {
    state.analyser.getByteFrequencyData(freq);
    state.analyser.getByteTimeDomainData(time);
    let mx = 8;
    const half = Math.floor(freq.length * 0.5);
    for (let i = 0; i < half; i++) if (freq[i] > mx) mx = freq[i];
    runMax = Math.max(mx, runMax * 0.96);
  }

  const tE = state.tEased;
  const acc = accent(tE);
  const boot = state.started ? Math.min(1, (now - state.bootAt) / 1500) : 0;

  // screen shake (fail)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sh = state.shake;
  if (sh > 0.01) ctx.translate((Math.random() * 2 - 1) * 2.5 * sh, (Math.random() * 2 - 1) * 2.5 * sh);

  // static layer (bezel, grid, scanlines, vignette) blitted from cache
  ctx.globalAlpha = 1;
  ctx.drawImage(stat, 0, 0, W, H);

  if (!state.started) {
    drawIdle(now);
    return;
  }
  ctx.globalAlpha = boot;

  drawTopRegister(m, acc, now);
  drawTensionGauge(m, tE, acc);
  if (state.endcard) drawEndcard(m, acc, now);
  else drawWord(m, acc, now, tE);
  drawInstruments(m, acc, now, tE);
  drawLog(m, now);

  // accent overlays
  if (state.greenSweep > 0) {
    const x = m + (W - 2 * m) * Math.min(1, state.greenSweep);
    ctx.globalAlpha = 0.5 * (1 - Math.min(1, state.greenSweep));
    ctx.fillStyle = PHOSPHOR;
    ctx.fillRect(x - 6, m, 6, H - 2 * m);
  }
  if (state.commitLock > 0.02) {
    ctx.globalAlpha = 0.12 * state.commitLock;
    ctx.fillStyle = PHOSPHOR;
    ctx.fillRect(0, 0, W, H);
  }
  if (state.invert > 0.02) {
    ctx.globalCompositeOperation = "difference";
    ctx.globalAlpha = state.invert;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.globalAlpha = 1;
}

function drawIdle(now) {
  ctx.globalAlpha = 1;
  text("SYSTEM://BUILDBEAT.MONITOR", W / 2, H / 2 - 8, 13, DIM, 500, 3, "center");
  const dots = ".".repeat(1 + (Math.floor(now / 400) % 3));
  text(`STANDBY${dots}`, W / 2, H / 2 + 16, 13, PHOSPHOR, 700, 3, "center");
}

function drawTopRegister(m, acc, now) {
  const y = m + (H - 2 * m) * 0.055;
  text("SYSTEM://BUILDBEAT.MONITOR", m + 8, y, 13, CHROME, 700, 1);
  const right = W - m - 8;
  const up = clk(now - state.bootAt);
  const parts = [
    ["UPTIME", up, WHITE],
    ["KEY", state.key.replace("major", "maj").replace("minor", "min").replace(" ", ""), CHROME],
    ["BPM", String(state.bpm).padStart(3, "0"), CHROME],
    ["STATUS", state.mood.toUpperCase(), acc],
  ];
  let x = right;
  for (const [label, val, color] of parts) {
    const vw = measure(val, 13, 700, 1);
    text(val, x, y, 13, color, 700, 1, "right");
    x -= vw + 8;
    const lw = measure(label, 13, 500, 1);
    text(label, x, y, 13, DIM, 500, 1, "right");
    x -= lw + 22;
  }
}

function drawTensionGauge(m, tE, acc) {
  const y = m + (H - 2 * m) * 0.12;
  const filled = Math.round(tE * 20);
  text("TENSION", m + 8, y, 13, DIM, 500, 2);
  const bx = m + 8 + measure("TENSION ", 13, 500, 2);
  ctx.font = `700 13px ${MONO}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let cx = bx;
  ctx.fillStyle = acc;
  ctx.fillText("[", cx, y);
  cx += 9;
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = i < filled ? acc : GRID;
    ctx.fillText("#", cx, y);
    cx += 9;
  }
  ctx.fillStyle = acc;
  ctx.fillText("]", cx, y);
  text(tE.toFixed(2), cx + 16, y, 13, WHITE, 700, 1);
}

function drawWord(m, acc, now, tE) {
  const word = (state.mood || "calm").toUpperCase();
  const cols = wordCols(word);
  if (!cols.length) return;
  const usableW = (W - 2 * m) * 0.9;
  const bandTop = m + (H - 2 * m) * 0.18;
  const bandH = (H - 2 * m) * 0.5;
  const cell = Math.min(usableW / cols.length, bandH / 7);
  const wpx = cols.length * cell;
  const hpx = 7 * cell;
  const ox = (W - wpx) / 2;
  const oy = bandTop + (bandH - hpx) / 2;
  const off = tE * 6 + state.accentKick * 5;
  const tearing = state.failTear > 0;
  const fontPx = cell * 0.96;

  const passes =
    off > 0.6
      ? [
          [-off, "hsl(345 100% 62%)", "lighter", 0.5],
          [off, "hsl(190 100% 62%)", "lighter", 0.5],
          [0, acc, "source-over", 1],
        ]
      : [[0, acc, "source-over", 1]];

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  for (const [dx, color, comp, aMul] of passes) {
    ctx.globalCompositeOperation = comp;
    ctx.font = `700 ${fontPx}px ${MONO}`;
    if (comp === "source-over") {
      ctx.shadowColor = acc;
      ctx.shadowBlur = 8 + 14 * tE;
    } else {
      ctx.shadowBlur = 0;
    }
    for (let c = 0; c < cols.length; c++) {
      const e = columnEnergy(c, cols.length, now);
      const rowShift = tearing && Math.random() < 0.1 ? (Math.random() * 2 - 1) * cell : 0;
      for (let r = 0; r < 7; r++) {
        if (!cols[c][r]) continue;
        // letter is ALWAYS legible (>=0.42), the spectrum carves it brighter
        const b = Math.min(1, 0.42 + 0.58 * e * (0.6 + 0.4 * (r / 6)));
        const px = ox + c * cell + dx + cell * 0.08;
        const py = oy + r * cell + (comp === "source-over" ? rowShift : 0) + cell * 0.08;
        const sz = cell * 0.84;
        ctx.fillStyle = color;
        ctx.globalAlpha = boot01() * aMul * b;
        ctx.fillRect(px, py, sz, sz);
      }
    }
  }
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}
function boot01() {
  return state.started ? Math.min(1, (performance.now() - state.bootAt) / 1500) : 0;
}

// The branded end frame for the clip: wordmark + install command + tagline.
function drawEndcard(m, acc, now) {
  const cx = W / 2;
  const cy = m + (H - 2 * m) * 0.42;
  ctx.shadowColor = acc;
  ctx.shadowBlur = 26;
  text("BUILDBEAT", cx, cy, Math.min(W * 0.1, 88), acc, 700, 8, "center");
  ctx.shadowBlur = 0;
  const cursor = Math.floor(now / 500) % 2 ? "_" : " ";
  text(`$ npx buildbeat${cursor}`, cx, cy + 54, 20, WHITE, 500, 2, "center");
  text("YOUR CODEBASE GETS A LIVE, ADAPTIVE SOUNDTRACK", cx, cy + 88, 12, DIM, 400, 3, "center");
}

function drawInstruments(m, acc, now, tE) {
  const top = m + (H - 2 * m) * 0.72;
  const bot = m + (H - 2 * m) * 0.86;
  const gx = (i) => m + ((W - 2 * m) * i) / 12;
  const midY = (top + bot) / 2;

  // VU (cols 0-3): ballistic needle on RMS, always moving
  let rms = 0;
  if (time) {
    let s = 0;
    for (let i = 0; i < time.length; i++) {
      const v = (time[i] - 128) / 128;
      s += v * v;
    }
    rms = Math.sqrt(s / time.length) * 1.8;
  }
  const target = Math.max(rms, state.accentKick, 0.05 + 0.03 * Math.sin(now * 0.002));
  vuVel += (target - vuPos) * 0.18;
  vuVel *= 0.78;
  vuPos = Math.max(0, Math.min(1.1, vuPos + vuVel));
  text("LEVEL", gx(0) + 8, top - 6, 11, DIM, 500, 2);
  const vx = gx(0) + 8;
  const vw = gx(3) - gx(0) - 24;
  const segs = 18;
  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < segs; i++) {
    const on = i / segs <= vuPos;
    const redline = i / segs > 0.75;
    ctx.fillStyle = on ? (redline ? accent(Math.max(tE, 0.85)) : acc) : GRID;
    ctx.fillRect(vx + (vw * i) / segs, midY - 7, vw / segs - 2, 14);
  }

  // WAVE (cols 4-9): oscilloscope
  text("WAVE", gx(4) + 8, top - 6, 11, DIM, 500, 2);
  const wx = gx(4) + 8;
  const ww = gx(9) - gx(4) - 16;
  ctx.strokeStyle = acc;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (time) {
    for (let i = 0; i < time.length; i += 4) {
      const x = wx + (ww * i) / time.length;
      const y = midY + Math.max(-18, Math.min(18, ((time[i] - 128) / 128) * 42));
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // SPECTRUM (cols 10-12): mini bars
  text("SPECTRUM", gx(10) + 8, top - 6, 11, DIM, 500, 2);
  const px = gx(10) + 8;
  const pw = gx(12) - gx(10) - 24;
  const bars = 12;
  for (let i = 0; i < bars; i++) {
    let v = 0;
    if (freq) {
      const half = Math.floor(freq.length * 0.5);
      const bin = Math.min(half - 1, Math.floor(half ** (i / bars)));
      v = Math.min(1, freq[bin] / (runMax + 1));
    }
    const bh = 16 * v + 1;
    ctx.fillStyle = acc;
    ctx.globalAlpha = 0.4 + 0.6 * v;
    ctx.fillRect(px + (pw * i) / bars, midY + 8 - bh, pw / bars - 2, bh);
  }
  ctx.globalAlpha = 1;
}

function drawLog(m, now) {
  const top = m + (H - 2 * m) * 0.89;
  const rows = state.log.slice(-4);
  const lh = (H - 2 * m) * 0.025;
  rows.forEach((e, i) => {
    e.reveal = Math.min(e.text.length, e.reveal + 0.9);
    const shown = e.text.slice(0, Math.floor(e.reveal));
    const active = i === rows.length - 1;
    const ts = clk(e.at - state.bootAt);
    const line = `[${ts}] ${e.prefix} ${shown}`;
    text(line, m + 8, top + i * lh + lh, 12.5, active ? WHITE : DIM, active ? 500 : 400, 0.5);
  });
}

// ---- boot ----
window.addEventListener("resize", resize);
resize();
if (document.fonts?.ready) document.fonts.ready.then(() => requestAnimationFrame(frame));
else requestAnimationFrame(frame);
