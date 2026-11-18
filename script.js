// =====================================================
//  Anna – page behaviour
// =====================================================
const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// -----------------------------------------------------
// 1) Fade sections in as they scroll into view
// -----------------------------------------------------
const revealEls = document.querySelectorAll("[data-reveal]");
if ("IntersectionObserver" in window && !calm) {
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(function (el) { io.observe(el); });
} else {
  revealEls.forEach(function (el) { el.classList.add("in"); });
}

// -----------------------------------------------------
// 2) Photo: gentle 3D tilt with the mouse (computers only)
// -----------------------------------------------------
const photoTilt = document.getElementById("photoTilt");
const photo = document.getElementById("photo");
const hasMouse = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

if (hasMouse && !calm) {
  photoTilt.addEventListener("mousemove", function (e) {
    const r = photoTilt.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    photoTilt.style.setProperty("--ry", (x * 6).toFixed(2) + "deg");
    photoTilt.style.setProperty("--rx", (y * -6).toFixed(2) + "deg");
  });
  photoTilt.addEventListener("mouseleave", function () {
    photoTilt.style.setProperty("--ry", "0deg");
    photoTilt.style.setProperty("--rx", "0deg");
  });
}

// -----------------------------------------------------
// 3) Photo: slow parallax while scrolling
// -----------------------------------------------------
if (!calm) {
  let ticking = false;
  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      const r = photo.parentElement.getBoundingClientRect();
      const offset = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
      photo.style.setProperty("--py", (offset * -24).toFixed(1) + "px");
      ticking = false;
    });
  }, { passive: true });
}

// Top bar turns dark when it sits over the navy section
const topbar = document.querySelector(".topbar");
const finale = document.querySelector(".finale");
function updateTopbar() {
  topbar.classList.toggle("dark", finale.getBoundingClientRect().top < 60);
}
window.addEventListener("scroll", updateTopbar, { passive: true });
updateTopbar();

// -----------------------------------------------------
// 4) The gift box
// -----------------------------------------------------
const pressBtn = document.getElementById("pressBtn");
const giftStage = document.getElementById("giftStage");
const giftLabel = document.getElementById("giftLabel");

pressBtn.addEventListener("click", function () {
  giftStage.classList.add("is-open");
  giftLabel.classList.add("show");
  pressBtn.classList.add("used");
  pressBtn.disabled = true;
});

// -----------------------------------------------------
// 5) Music
//    - Nothing plays until the Music button is pressed.
//    - If the file music/flute-theme.mp3 exists, it is played.
//    - Otherwise an original flute-style waltz is played,
//      generated live in the browser (Web Audio API).
// -----------------------------------------------------
const musicBtn = document.getElementById("musicBtn");
const musicState = document.getElementById("musicState");
const MUSIC_FILE = "music/flute-theme.mp3";

const Music = (function () {
  let ctx = null, master = null, reverb = null, noise = null;
  let timer = null, barIndex = 0, nextBarTime = 0;
  let fileAudio = null, useFile = null;   // null = not tested yet

  const BPM = 84;
  const BEAT = 60 / BPM;

  // Original melody in D major, 3/4 time. Format: note:beats[:s = short / g = grace]
  const MELODY = [
    "A4:1:s D5:.5 E5:.5 F#5:1",
    "F#5:.5 E5:.5 D5:1 B4:1",
    "G4:.5:s B4:.5:s D5:.5 G5:.5 F#5:1",
    "E5:2 C#5:1",
    "A4:.5:s A4:.5:s D5:1 F#5:.5 A5:.5:g",
    "A5:1 G5:.5 F#5:.5 E5:1",
    "D5:.5 E5:.5 G5:1:g B4:1",
    "A4:3",
    "B4:.5 C#5:.5 D5:1 F#5:1",
    "E5:.5 D5:.5 B4:2",
    "A4:.5:s B4:.5:s D5:.5 F#5:.5 A5:1",
    "G5:.5 F#5:.5 E5:2",
    "B5:.5:g A5:.5 G5:.5 F#5:.5 E5:1",
    "C#5:.5:s D5:.5:s E5:1 A4:1:s",
    "F#5:1.5 E5:.5 D5:1",
    "D5:2 -:1"
  ];
  // Chord per bar: [bass note, three chord notes] as MIDI numbers
  const CHORDS = [
    [50, [62, 66, 69]], [47, [59, 62, 66]], [43, [59, 62, 67]], [45, [61, 64, 69]],
    [50, [62, 66, 69]], [42, [61, 66, 69]], [43, [59, 62, 67]], [45, [61, 64, 67]],
    [47, [59, 62, 66]], [43, [59, 62, 67]], [50, [62, 66, 69]], [45, [61, 64, 69]],
    [43, [59, 62, 67]], [45, [61, 64, 67]], [50, [62, 66, 69]], [50, [62, 66, 69]]
  ];

  const NOTE_INDEX = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
  function midi(name) {
    const m = name.match(/^([A-G]#?)(\d)$/);
    return 12 * (parseInt(m[2], 10) + 1) + NOTE_INDEX[m[1]];
  }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  const BARS = MELODY.map(function (bar) {
    return bar.split(" ").map(function (tok) {
      const p = tok.split(":");
      return { note: p[0] === "-" ? null : midi(p[0]), beats: parseFloat(p[1]), mod: p[2] || "" };
    });
  });

  function setup() {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;

    // simple hall reverb made from decaying noise
    reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
    reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    reverb.connect(wet).connect(master);
    master.connect(ctx.destination);

    // breath noise for the flute
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  function out(node, dry) {
    const g = ctx.createGain();
    g.gain.value = dry;
    node.connect(g).connect(master);
    node.connect(reverb);
  }

  // flute-like voice: soft sine tones, delayed vibrato, a little breath
  function flute(t, m, dur, mod) {
    if (mod === "g") flute(t - 0.07, m + 2, 0.06, "s");
    const f = hz(m);
    const len = mod === "s" ? Math.min(dur * 0.55, 0.28) : dur * 0.92;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.2, t + 0.06);
    env.gain.linearRampToValueAtTime(0.15, t + Math.min(0.3, len));
    env.gain.setValueAtTime(0.15, t + len);
    env.gain.linearRampToValueAtTime(0, t + len + 0.14);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2800;
    env.connect(lp);
    out(lp, 0.8);

    [[1, 1], [2, 0.12], [3, 0.035]].forEach(function (h) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f * h[0];
      g.gain.value = h[1];
      if (h[0] === 1 && len > 0.35) {           // vibrato on longer notes
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = 5.2;
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(f * 0.006, t + 0.35);
        lfo.connect(depth).connect(o.frequency);
        lfo.start(t); lfo.stop(t + len + 0.2);
      }
      o.connect(g).connect(env);
      o.start(t); o.stop(t + len + 0.2);
    });

    const n = ctx.createBufferSource();
    n.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f * 2;
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.05, t + 0.03);
    ng.gain.exponentialRampToValueAtTime(0.006, t + 0.2);
    ng.gain.linearRampToValueAtTime(0, t + len + 0.1);
    n.connect(bp).connect(ng);
    out(ng, 0.6);
    n.start(t); n.stop(t + len + 0.15);
  }

  // soft harp-like pluck for the accompaniment
  function pluck(t, m, vol, decay) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    o.type = "triangle";
    o.frequency.value = hz(m);
    lp.type = "lowpass";
    lp.frequency.value = 1600;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    o.connect(lp).connect(g);
    out(g, 0.7);
    o.start(t); o.stop(t + decay + 0.05);
  }

  function scheduleBar(i, t0) {
    let t = t0;
    BARS[i].forEach(function (n) {
      if (n.note !== null) flute(t, n.note, n.beats * BEAT, n.mod);
      t += n.beats * BEAT;
    });
    const c = CHORDS[i];
    pluck(t0, c[0], 0.11, 2.2);
    [0.5, 1, 1.5, 2, 2.5].forEach(function (b, k) {
      pluck(t0 + b * BEAT, c[1][[0, 1, 2, 1, 0][k]], 0.035, 1.4);
    });
  }

  function tick() {
    while (nextBarTime < ctx.currentTime + 0.6) {
      scheduleBar(barIndex, nextBarTime);
      nextBarTime += 3 * BEAT;
      barIndex = (barIndex + 1) % BARS.length;
    }
  }

  function startSynth() {
    if (!ctx) setup();
    ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.5);
    nextBarTime = ctx.currentTime + 0.15;
    if (!timer) timer = setInterval(tick, 120);
  }

  function stopSynth() {
    if (!ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
    clearInterval(timer);
    timer = null;
    setTimeout(function () { if (!timer) ctx.suspend(); }, 700);
  }

  function play() {
    if (useFile === false) { startSynth(); return; }
    if (!fileAudio) {
      fileAudio = new Audio(MUSIC_FILE);
      fileAudio.loop = true;
      fileAudio.volume = 0.6;
    }
    // Unlock audio for Safari inside the click, in case we fall back.
    if (!ctx) { setup(); }
    ctx.resume();
    fileAudio.play().then(function () {
      useFile = true;
    }).catch(function () {
      useFile = false;          // no file found: use the built-in waltz
      if (Music.on) startSynth();
    });
  }

  function stop() {
    if (fileAudio && useFile) fileAudio.pause();
    stopSynth();
  }

  return { on: false, play: play, stop: stop };
})();

musicBtn.addEventListener("click", function () {
  Music.on = !Music.on;
  musicBtn.setAttribute("aria-pressed", String(Music.on));
  musicState.textContent = Music.on ? "On" : "Off";
  if (Music.on) Music.play(); else Music.stop();
});
