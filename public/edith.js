// E.D.I.T.H. — client logic: voice in (Web Speech), voice out (speechSynthesis),
// wake-word listening, conversation memory, and streaming replies from the server.

import { edithBrain } from "./brain.js";
import { trySports } from "./sports.js";
import { tryPlayer } from "./players.js";
import { tryMarvel, tryBattle } from "./marvel.js";

const el = (id) => document.getElementById(id);
const reactor = el("reactor");
const caption = el("caption");
const logEl = el("log");
const statusPill = el("statusPill");
const statusText = el("statusText");
const micBtn = el("micBtn");
const textForm = el("textForm");
const textInput = el("textInput");
const wakeToggle = el("wakeToggle");
const voiceToggle = el("voiceToggle");

// Conversation memory: the full message history sent to Claude each turn.
const history = [];
let busy = false;

// "claude" when the server has an API key; "local" for the free offline brain.
let MODE = "local";
const brainMem = {}; // scratch memory for the local brain (e.g. your name)

// ---------- Status + captions ----------
function setStatus(state, text) {
  statusPill.dataset.state = state;
  statusText.textContent = text;
}
function say(text) {
  caption.textContent = text;
}

// ---------- Transcript log ----------
function addBubble(who, text) {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  const label = document.createElement("span");
  label.className = "who";
  label.textContent = who === "user" ? "OPERATOR" : "E.D.I.T.H.";
  const body = document.createElement("span");
  body.textContent = text;
  div.append(label, body);
  logEl.append(div);
  logEl.scrollTop = logEl.scrollHeight;
  return body; // so streaming replies can keep appending
}

// ---------- Reactor audio-reactive visualizer ----------
const viz = el("viz");
const vctx = viz.getContext("2d");
let vizLevel = 0; // 0..1 target amplitude
let vizPhase = 0;
function drawViz() {
  const w = viz.width,
    h = viz.height,
    cx = w / 2,
    cy = h / 2;
  vctx.clearRect(0, 0, w, h);
  vizPhase += 0.08;
  const rings = 3;
  for (let r = 0; r < rings; r++) {
    vctx.beginPath();
    const base = 34 + r * 22;
    const points = 90;
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2;
      const wobble =
        Math.sin(a * (4 + r) + vizPhase + r) * (6 + vizLevel * 34) * (0.5 + vizLevel);
      const rad = base + wobble;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      i === 0 ? vctx.moveTo(x, y) : vctx.lineTo(x, y);
    }
    vctx.closePath();
    vctx.strokeStyle = `rgba(70, 230, 255, ${0.25 + 0.2 * (rings - r) + vizLevel * 0.4})`;
    vctx.lineWidth = 1.5;
    vctx.shadowColor = "rgba(70,230,255,0.8)";
    vctx.shadowBlur = 8 + vizLevel * 20;
    vctx.stroke();
  }
  // ease the level back toward idle
  vizLevel *= 0.92;
  requestAnimationFrame(drawViz);
}
drawViz();

// ---------- Speech synthesis (EDITH's voice) ----------
let voices = [];
function loadVoices() {
  voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
}
if (window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}
function pickVoice() {
  // Prefer a British female voice for that Stark-tech feel; fall back gracefully.
  const pref = [
    (v) => /en-GB/i.test(v.lang) && /female|Sonia|Libby|Hazel|Google UK English Female/i.test(v.name),
    (v) => /en-GB/i.test(v.lang),
    (v) => /Samantha|Google US English|female/i.test(v.name),
    (v) => /^en/i.test(v.lang),
  ];
  for (const test of pref) {
    const found = voices.find(test);
    if (found) return found;
  }
  return voices[0];
}

let speakTimer = null;
function speak(text) {
  if (!voiceToggle.checked || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = 1.02;
  u.pitch = 1.0;
  u.onstart = () => {
    setStatus("speaking", "SPEAKING");
    // Fake an amplitude envelope so the reactor pulses while she talks.
    clearInterval(speakTimer);
    speakTimer = setInterval(() => (vizLevel = 0.35 + Math.random() * 0.5), 90);
  };
  u.onend = () => {
    clearInterval(speakTimer);
    reactor.classList.remove("active");
    if (!busy) setStatus("standby", wakeActive ? "LISTENING FOR ‘EDITH’" : "STANDBY");
  };
  window.speechSynthesis.speak(u);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Time & date always come from the device clock — never the AI brain (which has
// no real-time access). Answered locally on every version, phone included.
function tryClock(text) {
  const t = text.toLowerCase();
  if (
    /\bwhat('?s| is)? (the )?time\b/.test(t) ||
    /\bwhat time is it\b/.test(t) ||
    /\b(the )?time (is it|right now|now)\b/.test(t) ||
    /\bgot the time\b/.test(t)
  ) {
    const now = new Date();
    return `It's ${now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}, boss.`;
  }
  if (
    /\bwhat('?s| is)? (the )?date\b/.test(t) ||
    /\bwhat day is it\b/.test(t) ||
    /\bwhat('?s| is)? today\b/.test(t) ||
    /\btoday'?s date\b/.test(t) ||
    /\bwhat day.*today\b/.test(t)
  ) {
    const now = new Date();
    return `Today is ${now.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })}.`;
  }
  return null;
}

// ---------- Asking EDITH (routes to Claude or the local brain) ----------
async function ask(userText) {
  if (busy || !userText.trim()) return;
  busy = true;

  addBubble("user", userText);
  history.push({ role: "user", content: userText });

  setStatus("thinking", "PROCESSING");
  reactor.classList.add("active", "scanning");
  say("…");

  const bubble = addBubble("edith", "");

  try {
    // Live-data questions (shirt numbers, fixtures, results) get real data
    // first, whatever brain is active.
    const liveReply =
      tryClock(userText) ||
      (await tryPlayer(userText)) ||
      (await trySports(userText)) ||
      (await tryBattle(userText)) ||
      (await tryMarvel(userText));
    let full;
    if (liveReply) {
      full = await typeOut(liveReply, bubble);
    } else if (MODE === "server") {
      full = await streamFromServer(bubble);
    } else {
      full = await streamFromLocal(userText, bubble);
    }

    history.push({ role: "assistant", content: full });
    reactor.classList.remove("scanning");
    speak(full);
  } catch (err) {
    reactor.classList.remove("active", "scanning");
    setStatus("error", "FAULT");
    const msg = "I've hit a systems fault. Check that the server is still running.";
    bubble.textContent = msg;
    caption.textContent = msg;
    speak(msg);
    console.error(err);
  } finally {
    busy = false;
    if (statusPill.dataset.state !== "speaking" && statusPill.dataset.state !== "error") {
      setStatus("standby", wakeActive ? "LISTENING FOR ‘EDITH’" : "STANDBY");
    }
  }
}

// Stream a live reply from the server (Claude or Ollama), token by token.
async function streamFromServer(bubble) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: history }),
  });
  if (!res.ok) throw new Error(`server ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    bubble.textContent = full;
    caption.textContent = full;
    logEl.scrollTop = logEl.scrollHeight;
    vizLevel = 0.4;
  }
  return full;
}

// "Type" a ready-made reply out word by word so it feels alive (used by the
// offline brain and the live sports answers).
async function typeOut(reply, bubble) {
  const words = reply.split(" ");
  let full = "";
  for (let i = 0; i < words.length; i++) {
    full += (i ? " " : "") + words[i];
    bubble.textContent = full;
    caption.textContent = full;
    logEl.scrollTop = logEl.scrollHeight;
    vizLevel = 0.45;
    await sleep(45 + Math.random() * 40);
  }
  return reply;
}

// Offline brain: compute the reply, then type it out.
async function streamFromLocal(userText, bubble) {
  const reply = await edithBrain(userText, brainMem);
  return typeOut(reply, bubble);
}

// ---------- Speech recognition (voice input + wake word) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;
let recognizing = false;
let pushToTalk = false; // true while user holds/taps the mic for a direct command
let wakeActive = false; // continuous wake-word listener running
// Speech recognition often mishears "EDITH" — accept the whole sound-alike family
// (edith, edyth, edith, edit, eddie, eddy, edi, adith, aditi, aditya, heidi, e dith…)
// so calling her is easy. A few false triggers is a fair trade for not being ignored.
const WAKE_CORE = "e+d+[iy]t?h?e?|ed(?:it|its|ie|dy|die|i)|eddie|a?dith|aditi|aditya|heidi|e[- ]?d[iy]th?";
const WAKE = new RegExp("\\b(" + WAKE_CORE + ")\\b", "i");

function supportsSR() {
  return !!SR;
}

function buildRecognizer() {
  const r = new SR();
  r.lang = "en-US";
  r.interimResults = true;
  r.continuous = true;
  r.maxAlternatives = 1;

  r.onstart = () => {
    recognizing = true;
  };
  r.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      wakeToggle.checked = false;
      wakeActive = false;
      setStatus("error", "MIC BLOCKED");
      say("Microphone access is blocked. Enable it in your browser to talk to me.");
    }
  };
  r.onend = () => {
    recognizing = false;
    // While the user is holding to talk, keep the mic open until they release.
    if (pushToTalk) {
      try { r.start(); } catch { /* already starting */ }
      return;
    }
    micBtn.classList.remove("recording");
    // Keep the wake-word listener alive by restarting unless we're busy talking.
    if (wakeActive && !busy) {
      try { r.start(); } catch { /* already starting */ }
    }
  };
  r.onresult = onResult;
  return r;
}

// --- Utterance capture: wait for a genuine pause before answering ---
let finalBuffer = ""; // finalized speech accumulated for the current utterance
let pendingCmd = ""; // best current command text, submitted on pause / release
let awaitingCommand = false;
let silenceTimer = null;
// How long a pause counts as "I'm done talking". Raise this if she still
// jumps in too early; lower it if she feels sluggish to respond.
const SILENCE_MS = 2500;
const WAKE_STRIP = new RegExp("^.*?\\b(?:" + WAKE_CORE + ")\\b[,.\\s]*", "i");

function onResult(event) {
  // Ignore the mic while EDITH is thinking or speaking, so she can't trigger
  // herself on her own voice or answer over you.
  if (busy || (window.speechSynthesis && window.speechSynthesis.speaking)) return;

  let interim = "";
  let newFinal = "";
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const t = event.results[i][0].transcript;
    if (event.results[i].isFinal) newFinal += t + " ";
    else interim += t;
  }
  if (newFinal) finalBuffer += newFinal;
  const displayText = (finalBuffer + " " + interim).trim();
  vizLevel = Math.min(1, 0.3 + displayText.length / 40);

  // Push-to-talk: the whole utterance is the command. We DON'T auto-submit on a
  // pause here — you decide when you're done by releasing (or tapping to stop).
  if (pushToTalk) {
    pendingCmd = displayText;
    say(displayText || "Listening…");
    return;
  }

  // Wake-word mode: do nothing until we actually hear the name.
  if (!awaitingCommand) {
    if (WAKE.test(displayText)) {
      awaitingCommand = true;
      setStatus("listening", "YES, BOSS?");
      reactor.classList.add("active");
    } else {
      return;
    }
  }

  const cmd = displayText.replace(WAKE_STRIP, "").trim();
  pendingCmd = cmd;
  say(cmd || "Yes, boss?");
  armSilence(); // reset on EVERY word, so we only fire after a real pause
}

// (Re)start the "you've stopped talking" countdown (wake-word mode only).
function armSilence() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(submitUtterance, SILENCE_MS);
}

// Send whatever's been captured, once you've actually paused / released.
function submitUtterance() {
  clearTimeout(silenceTimer);
  const cmd = pendingCmd.trim();
  const wasPTT = pushToTalk;

  finalBuffer = "";
  pendingCmd = "";
  awaitingCommand = false;
  reactor.classList.remove("active");

  if (wasPTT) {
    pushToTalk = false;
    micBtn.classList.remove("recording");
    try { recog && recog.stop(); } catch {}
  }

  if (cmd) {
    ask(cmd);
  } else if (wasPTT) {
    setStatus("standby", wakeActive ? "LISTENING FOR ‘EDITH’" : "STANDBY");
  } else {
    setStatus("standby", "LISTENING FOR ‘EDITH’");
    say("Standing by. Say “EDITH” when you need me.");
  }
}

// ---------- Push-to-talk ----------
function startPushToTalk() {
  if (busy) return;
  if (!supportsSR()) {
    say("Voice input isn't supported in this browser — try Chrome or Edge, or type below.");
    return;
  }
  pushToTalk = true;
  awaitingCommand = false;
  finalBuffer = "";
  pendingCmd = "";
  clearTimeout(silenceTimer);
  if (!recog) recog = buildRecognizer();
  try { recog.stop(); } catch {}
  setTimeout(() => {
    try { recog.start(); } catch {}
  }, 60);
  micBtn.classList.add("recording");
  reactor.classList.add("active");
  setStatus("listening", "LISTENING");
  say("Listening…");
}

// Called when you release / tap to stop: submit exactly what you said.
function stopPushToTalk() {
  if (!pushToTalk) return;
  submitUtterance();
}

// ---------- Wake word lifecycle ----------
function startWake() {
  if (!supportsSR()) {
    wakeToggle.checked = false;
    return;
  }
  wakeActive = true;
  if (!recog) recog = buildRecognizer();
  awaitingCommand = false;
  try {
    recog.start();
  } catch {}
  if (!busy) setStatus("standby", "LISTENING FOR ‘EDITH’");
}
function stopWake() {
  wakeActive = false;
  try {
    recog && recog.stop();
  } catch {}
  if (!busy) setStatus("standby", "STANDBY");
}

// Watchdog: browsers silently stop speech recognition (timeouts, brief network
// blips). If the wake listener should be running but isn't, quietly restart it,
// so "EDITH" is always heard.
setInterval(() => {
  if (wakeActive && !pushToTalk && !busy && !recognizing && recog) {
    try { recog.start(); } catch { /* already starting */ }
  }
}, 3000);

// ---------- Wire up controls ----------
// Mic button: press-and-hold OR tap-to-toggle.
micBtn.addEventListener("mousedown", startPushToTalk);
micBtn.addEventListener("mouseup", () => pushToTalk && stopPushToTalk());
micBtn.addEventListener("mouseleave", () => pushToTalk && stopPushToTalk());
micBtn.addEventListener("touchstart", (e) => {
  e.preventDefault();
  startPushToTalk();
});
micBtn.addEventListener("touchend", (e) => {
  e.preventDefault();
  stopPushToTalk();
});

// Tap the reactor to talk too.
reactor.addEventListener("click", () => {
  if (pushToTalk) stopPushToTalk();
  else startPushToTalk();
  // stop after first result via onResult -> stopPushToTalk
});

textForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const t = textInput.value.trim();
  if (!t) return;
  textInput.value = "";
  ask(t);
});

wakeToggle.addEventListener("change", () => {
  wakeToggle.checked ? startWake() : stopWake();
});
voiceToggle.addEventListener("change", () => {
  if (!voiceToggle.checked && window.speechSynthesis) window.speechSynthesis.cancel();
});

el("clearBtn").addEventListener("click", () => {
  history.length = 0;
  logEl.innerHTML = "";
  say("Memory wiped. Fresh start, boss.");
});

// ---------- Clock + live date tile ----------
function updateDateTile() {
  const now = new Date();
  const num = document.querySelector(".dd-num");
  const day = document.querySelector(".dd-day");
  if (num) num.textContent = now.getDate();
  if (day) day.textContent = now.toLocaleDateString("en-GB", { weekday: "long" }).toUpperCase();
  const td = document.getElementById("topdate");
  if (td) {
    td.textContent = now
      .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
      .toUpperCase();
  }
}
setInterval(() => {
  el("clock").textContent = new Date().toLocaleTimeString("en-GB");
  updateDateTile(); // cheap; keeps the date correct across midnight
}, 1000);
updateDateTile();

// ---------- Boot ----------
async function detectMode() {
  try {
    const res = await fetch("/api/mode");
    const { backend } = await res.json();
    // claude + ollama both stream from the server; only "local" uses the rule brain.
    MODE = backend === "local" ? "local" : "server";
  } catch {
    MODE = "local";
  }
}

window.addEventListener("load", () => {
  el("clock").textContent = new Date().toLocaleTimeString("en-GB");
  detectMode();
  if (!supportsSR()) {
    wakeToggle.checked = false;
    wakeToggle.disabled = true;
    say("Voice input needs Chrome or Edge. You can still type commands below.");
  } else if (wakeToggle.checked) {
    // Browsers require a user gesture before mic access; start on first interaction.
    const kick = () => {
      startWake();
      window.removeEventListener("pointerdown", kick);
    };
    window.addEventListener("pointerdown", kick);
    say("Tap anywhere to bring me online, then say “EDITH”.");
  }
});
