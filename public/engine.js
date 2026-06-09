// buildbeat audio + websocket core. The visual layer lives in render.js and
// reads the shared `state` object below. The audio graph here is verified
// (seam-free crossfade, unit-tested) and must not change for visual reasons.

const CROSSFADE_S = 1.4; // seam-hiding ramp length; keeps morphs under the ~2s gate

/** Equal-power gains: gainA^2 + gainB^2 === 1, so loudness stays constant. */
function equalPowerGains(p) {
  const x = Math.max(0, Math.min(1, p));
  return [Math.cos((x * Math.PI) / 2), Math.sin((x * Math.PI) / 2)];
}

/** Tense bed stays fully silent until tension ~0.12, then fades in. */
function tensePresence(t) {
  return Math.max(0, Math.min(1, (t - 0.12) / 0.7));
}

/** Mirror of intentForTension() in src/music/driver.ts, for the local slider. */
function intentForTension(t) {
  const tension = Math.max(0, Math.min(1, t));
  const mood = tension < 0.15 ? "calm" : tension < 0.45 ? "focus" : tension < 0.8 ? "tense" : "fail";
  return {
    tension,
    mood,
    density: 0.3 + 0.6 * tension,
    brightness: 0.7 - 0.4 * tension,
    bpm: Math.round(72 + 36 * tension),
    key: tension < 0.5 ? "C major" : "A minor",
  };
}

/** Everything the renderer needs, written here, read in render.js. */
export const state = {
  started: false,
  analyser: null,
  tensionTarget: 0.05,
  tEased: 0.05,
  mood: "calm",
  bpm: 72,
  key: "C major",
  log: [],
  bootAt: 0,
  accentKick: 0, // decays each frame
  failTear: 0, // frames of fail glitch remaining
  shake: 0, // 0..1 screen-shake envelope
  invert: 0, // 0..1 invert-flash envelope
  greenSweep: 0, // 0..1 left->right wipe progress
  commitLock: 0, // 0..1 commit "crisp hold" envelope
  endcard: false, // show the branded "npx buildbeat" end frame
};

const overlay = document.getElementById("overlay");
const knob = document.getElementById("knob");
const srmood = document.getElementById("srmood");

let ctx = null;
let master = null;
let analyser = null;
let calmBed = null;
let tenseBed = null;
let started = false;

function audioGain(v) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

/** Smoothly move an AudioParam without a click (continue from the live value). */
function ramp(param, target, now, end) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, end);
}

/** A clean, smooth reverb: parallel damped feedback-delay combs (no noise). */
function makeReverb() {
  const input = audioGain(1);
  const output = audioGain(1);
  for (const dt of [0.0297, 0.0419, 0.0617, 0.0893]) {
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = dt;
    const feedback = audioGain(0.5);
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2400;
    input.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    delay.connect(output);
  }
  return { input, output };
}

/** One mood bed: detuned oscillator chord -> lowpass -> (breathing/throb LFO) -> gain. */
function makeBed(opts) {
  const outer = audioGain(0);
  const inner = audioGain(opts.level);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = opts.cutoff;
  filter.Q.value = 0.5;
  inner.connect(filter);
  filter.connect(outer);
  outer.connect(master);

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = opts.lfoRate;
  const lfoDepth = audioGain(opts.lfoDepth);
  lfo.connect(lfoDepth);
  lfoDepth.connect(inner.gain);
  lfo.start();

  const voices = opts.freqs.length * 2;
  for (const f of opts.freqs) {
    for (const d of [-opts.detune, opts.detune]) {
      const osc = ctx.createOscillator();
      osc.type = opts.type;
      osc.frequency.value = f;
      osc.detune.value = d;
      const g = audioGain(1 / voices);
      osc.connect(g);
      g.connect(inner);
      osc.start();
    }
  }
  return { outer, inner, filter, lfo, lfoDepth };
}

function start() {
  if (started) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();

  master = audioGain(0);
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 5000;
  tone.Q.value = 0.4;
  const rumble = ctx.createBiquadFilter();
  rumble.type = "highpass";
  rumble.frequency.value = 45;
  master.connect(tone);
  tone.connect(rumble);

  const reverb = makeReverb();
  const wet = audioGain(0.16);
  const dry = audioGain(0.92);
  rumble.connect(dry);
  rumble.connect(reverb.input);
  reverb.output.connect(wet);

  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  dry.connect(analyser);
  wet.connect(analyser);
  analyser.connect(ctx.destination);

  // Self-record tap (open the page with `?record` to enable): expose the final
  // audio mix as a MediaStream so the page can record canvas + audio into one
  // video file, no screen recorder needed.
  if (new URLSearchParams(location.search).has("record")) {
    const recDest = ctx.createMediaStreamDestination();
    dry.connect(recDest);
    wet.connect(recDest);
    window.__bbAudioStream = recDest.stream;
  }

  calmBed = makeBed({
    freqs: [65.41, 130.81, 164.81, 196.0, 246.94, 293.66],
    type: "triangle",
    detune: 3,
    cutoff: 900,
    level: 0.5,
    lfoRate: 0.07,
    lfoDepth: 0.05,
  });
  tenseBed = makeBed({
    freqs: [110.0, 130.81, 164.81, 220.0, 311.13],
    type: "triangle",
    detune: 5,
    cutoff: 1000,
    level: 0.46,
    lfoRate: 1.6,
    lfoDepth: 0.0,
  });

  started = true;
  state.started = true;
  state.analyser = analyser;
  state.bootAt = performance.now();
  master.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 2);
  setIntent(intentForTension(state.tensionTarget));
  connectWS();
}

/** Audio-only: crossfade the beds + filters + tense throb. Visuals read `state`. */
function setIntent(intent) {
  if (!started) return;
  const t = intent.tension;
  const [gCalm, gTense] = equalPowerGains(tensePresence(t));
  const now = ctx.currentTime;
  const end = now + CROSSFADE_S;
  ramp(calmBed.outer.gain, gCalm, now, end);
  ramp(tenseBed.outer.gain, gTense, now, end);
  ramp(calmBed.filter.frequency, 760 + 480 * intent.brightness, now, end);
  ramp(tenseBed.filter.frequency, 900 + 1300 * t, now, end);
  ramp(tenseBed.lfo.frequency, 1.4 + 3.2 * t, now, end);
  ramp(tenseBed.lfoDepth.gain, 0.16 * t, now, end);
}

/** A short one-shot voice through the master bus (so it gets the reverb). */
function playTone(freq, type, dur, level, glideTo) {
  if (!started) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, now + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(level, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.05);
}

/** Tasteful one-shot hits at the key moments: soft, short, reverbed. */
function playAccent(kind) {
  if (!started) return;
  if (kind === "green") {
    [523.25, 659.25, 783.99].forEach((f, i) =>
      setTimeout(() => playTone(f, "triangle", 0.5, 0.16), i * 90),
    );
  } else if (kind === "commit") {
    playTone(130.81, "triangle", 1.4, 0.13);
    [261.63, 329.63, 392.0, 523.25].forEach((f, i) =>
      setTimeout(() => playTone(f, "triangle", 1.1, 0.1), i * 55),
    );
    setTimeout(() => playTone(1046.5, "sine", 0.8, 0.06), 130);
  } else if (kind === "fail") {
    playTone(110, "triangle", 0.6, 0.16, 72);
    playTone(116.54, "sine", 0.45, 0.05);
  }
}

/** Push a caption into the event log with a typewriter-reveal counter. */
function pushLog(text, accent) {
  const prefix = accent === "fail" ? "!!" : accent === "green" ? "++" : accent === "commit" ? ">>" : "..";
  state.log.push({ text, prefix, reveal: 0, at: performance.now() });
  while (state.log.length > 7) state.log.shift();
}

/** Arm the one-shot visual reactions the renderer reads + decays. */
function fireAccent(kind) {
  state.accentKick = 1;
  if (kind === "fail") {
    state.failTear = 16;
    state.shake = 1;
    state.invert = 1;
  } else if (kind === "green") {
    state.greenSweep = 1;
  } else if (kind === "commit") {
    state.commitLock = 1;
  }
}

function applyIntent(intent, label, accent, endcard = false) {
  setIntent(intent);
  if (accent) playAccent(accent);
  state.tensionTarget = intent.tension;
  state.mood = intent.mood;
  state.bpm = intent.bpm;
  state.key = intent.key;
  state.endcard = endcard;
  if (srmood) srmood.textContent = intent.mood;
  if (typeof label === "string") pushLog(label, accent);
  if (accent) fireAccent(accent);
}

// Auto-record the clip (open the page with `?record`): begins on the FIRST arc
// beat so the capture is synced to the calm start, records one arc (calm ->
// end card), and POSTs the webm to /clip. Off unless `?record` is present.
let recStarted = false;
function maybeAutoRecord() {
  if (recStarted || !new URLSearchParams(location.search).has("record")) return;
  if (!window.__bbAudioStream) return;
  recStarted = true;
  const canvas = document.getElementById("screen");
  const mixed = new MediaStream([
    ...canvas.captureStream(30).getVideoTracks(),
    ...window.__bbAudioStream.getAudioTracks(),
  ]);
  const rec = new MediaRecorder(mixed, {
    mimeType: "video/webm;codecs=vp9,opus",
    videoBitsPerSecond: 3_500_000,
    audioBitsPerSecond: 160_000,
  });
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };
  rec.onstop = async () => {
    await fetch("/clip", { method: "POST", body: new Blob(chunks, { type: "video/webm" }) });
    window.__bbRecordDone = true;
  };
  rec.start(1000);
  setTimeout(() => rec.stop(), 24000);
}

function connectWS() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type !== "intent") return;
    applyIntent(msg.intent, msg.label, msg.accent, msg.endcard);
    maybeAutoRecord();
  });
  ws.addEventListener("close", () => setTimeout(connectWS, 1000));
}

// First gesture boots the AudioContext (browsers require it).
overlay.addEventListener("click", () => {
  overlay.classList.add("hidden");
  start();
});

// Hidden manual control, kept for local testing.
knob.addEventListener("input", () => {
  applyIntent(intentForTension(Number(knob.value) / 100), null, null);
});
