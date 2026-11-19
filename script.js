// =====================================================
//  ANNUSHKA – page behaviour
// =====================================================
const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const hasIO = "IntersectionObserver" in window;

// -----------------------------------------------------
// 0) Hand-drawn dogs: copy the drawing into every [data-dog] spot
// -----------------------------------------------------
const dogTemplate = document.getElementById("dogTemplate");
if (dogTemplate && dogTemplate.content) {
  document.querySelectorAll("[data-dog]").forEach(function (spot) {
    spot.appendChild(dogTemplate.content.cloneNode(true));
  });
}

// -----------------------------------------------------
// 1) Fade sections in as they scroll into view
// -----------------------------------------------------
const revealEls = document.querySelectorAll("[data-reveal], [data-reveal-line]");
if (hasIO && !calm) {
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
  revealEls.forEach(function (el) { io.observe(el); });
} else {
  revealEls.forEach(function (el) { el.classList.add("in"); });
}

// -----------------------------------------------------
// 2) Heart moment: when the second section arrives, the same
//    picture floats by in a heart frame, then leaves.
//    The section's own content appears once it has gone.
// -----------------------------------------------------
const favourites = document.getElementById("favourites");
const heartMoment = document.getElementById("heartMoment");

if (favourites && heartMoment) {
  if (hasIO && !calm) {
    favourites.classList.add("awaiting-heart");

    const heartIO = new IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      heartIO.disconnect();
      playHeart();
    }, { rootMargin: "0px 0px -55% 0px" });
    heartIO.observe(favourites);
  } else {
    heartMoment.remove();
  }
}

function playHeart() {
  const float = heartMoment.querySelector(".heart-float");
  const sec = favourites.getBoundingClientRect();
  const h = float.offsetHeight;
  // centre the heart in the window, but keep it inside the section
  let top = window.innerHeight / 2 - sec.top - h / 2;
  top = Math.max(0, Math.min(top, favourites.offsetHeight - h));
  heartMoment.style.setProperty("--heart-top", top + "px");
  heartMoment.classList.add("play");

  // let the content rise while the heart fades upward
  setTimeout(function () { favourites.classList.remove("awaiting-heart"); }, 2000);
  setTimeout(function () { heartMoment.remove(); }, 3100);
}

// -----------------------------------------------------
// 3) Scroll depth: skylines drift slowly, the burgundy
//    section's edges open up as it arrives
// -----------------------------------------------------
const topbar = document.querySelector(".topbar");
const finale = document.querySelector(".finale");
const heroSky = document.querySelector(".hero-skyline");
const finaleSky = document.querySelector(".finale-skyline");

function onScroll() {
  const vh = window.innerHeight;
  const fr = finale.getBoundingClientRect();

  // top bar turns dark over the burgundy section
  topbar.classList.toggle("dark", fr.top < 60);

  if (calm) return;
  heroSky.style.setProperty("--sky-y", Math.min(window.scrollY * 0.18, 240).toFixed(1) + "px");

  // 0 when the section is just below the window, 1 when it fills the top half
  const p = Math.max(0, Math.min(1, (vh - fr.top) / (vh * 0.6)));
  const inset = (1 - p) * Math.min(window.innerWidth * 0.05, 48);
  finale.style.setProperty("--fin-x", inset.toFixed(1) + "px");
  finale.style.setProperty("--fin-r", ((1 - p) * 36).toFixed(1) + "px");

  const sr = finaleSky.getBoundingClientRect();
  const off = (sr.top + sr.height / 2 - vh / 2) / vh;
  finaleSky.style.setProperty("--sky2-y", (off * 30).toFixed(1) + "px");
}

let ticking = false;
window.addEventListener("scroll", function () {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(function () { onScroll(); ticking = false; });
}, { passive: true });
window.addEventListener("resize", onScroll);
onScroll();

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
// 5) Music – RetRet (local file: retret-song.mp3)
//    - Tries to start by itself at 20% volume.
//    - If the browser blocks that, a "Play Music" button appears.
//    - The status text only says "Playing" after playback really starts.
// -----------------------------------------------------
const audio = document.getElementById("bgMusic");
const player = document.getElementById("player");
const playBtn = document.getElementById("playBtn");
const muteBtn = document.getElementById("muteBtn");
const volumeEl = document.getElementById("volume");
const stateEl = document.getElementById("playerState");
const musicPrompt = document.getElementById("musicPrompt");
const promptPlay = document.getElementById("promptPlay");
const promptClose = document.getElementById("promptClose");

const START_VOLUME = 0.2;
let isPlaying = false;
let isLoading = false;
let failed = false;

// iPhone/iPad ignore page volume; hide the slider there (mute still works)
const canSetVolume = (function () {
  try { const t = document.createElement("audio"); t.volume = 0.5; return Math.abs(t.volume - 0.5) < 0.01; }
  catch (e) { return false; }
})();
if (!canSetVolume) player.classList.add("no-volume");

audio.volume = START_VOLUME;

function render() {
  const muted = audio.muted || (canSetVolume && audio.volume === 0);
  player.classList.toggle("is-playing", isPlaying);
  player.classList.toggle("is-muted", muted);

  playBtn.setAttribute("aria-pressed", String(isPlaying));
  playBtn.setAttribute("aria-label", isPlaying ? "Pause music" : "Play music");
  playBtn.disabled = failed;
  muteBtn.setAttribute("aria-pressed", String(muted));
  muteBtn.setAttribute("aria-label", muted ? "Unmute music" : "Mute music");

  const pct = Math.round((audio.muted ? 0 : audio.volume) * 100);
  volumeEl.value = pct;
  volumeEl.style.setProperty("--v", pct + "%");

  let label = "Paused";
  if (failed) label = "Unavailable";
  else if (isLoading) label = "Loading";
  else if (isPlaying) label = muted ? "Muted" : "Playing";
  stateEl.textContent = label;
}

function showPrompt() {
  if (isPlaying || failed) return;
  musicPrompt.hidden = false;
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { musicPrompt.classList.add("show"); });
  });
}
function hidePrompt() {
  musicPrompt.classList.remove("show");
  setTimeout(function () { if (!musicPrompt.classList.contains("show")) musicPrompt.hidden = true; }, 800);
}

function startMusic() {
  if (failed) return;
  isLoading = true;
  render();
  let result;
  try { result = audio.play(); } catch (e) { result = Promise.reject(e); }
  if (result && typeof result.then === "function") {
    result.then(function () {
      isLoading = false;
      hidePrompt();
      render();
    }).catch(function () {
      // Usually: the browser wants a click first (autoplay policy)
      isLoading = false;
      render();
      showPrompt();
    });
  }
}

audio.addEventListener("playing", function () { isPlaying = true; isLoading = false; hidePrompt(); render(); });
audio.addEventListener("pause", function () { isPlaying = false; render(); });
audio.addEventListener("waiting", function () { if (isPlaying) { isLoading = true; render(); } });
audio.addEventListener("volumechange", render);
audio.addEventListener("error", function () {
  failed = true; isPlaying = false; isLoading = false;
  hidePrompt();
  render();
});

playBtn.addEventListener("click", function () {
  if (isPlaying) audio.pause();
  else startMusic();
});

muteBtn.addEventListener("click", function () {
  if (audio.muted || (canSetVolume && audio.volume === 0)) {
    audio.muted = false;
    if (audio.volume === 0) audio.volume = START_VOLUME;
  } else {
    audio.muted = true;
  }
  render();
});

volumeEl.addEventListener("input", function () {
  const v = Number(volumeEl.value) / 100;
  audio.volume = v;
  audio.muted = v === 0;
  render();
});

promptPlay.addEventListener("click", startMusic);
promptClose.addEventListener("click", hidePrompt);

render();
startMusic();   // try autoplay at 20%
