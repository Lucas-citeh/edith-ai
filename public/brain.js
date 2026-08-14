// E.D.I.T.H. — local (no-API-key) brain.
// Rule-based replies with EDITH's persona. Not as smart as Claude, but free and
// fully offline. Returns a string (or a Promise<string>) given the user's text.
// `mem` is a small persistent object you can stash things in across a session.

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function timeReply() {
  const now = new Date();
  const t = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return pick([
    `It's ${t}, boss.`,
    `The time is ${t}.`,
    `${t}. Clock's ticking.`,
  ]);
}

function dateReply() {
  const d = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `Today is ${d}.`;
}

// Very small arithmetic parser: "what is 12 * 7", "3 plus 4", "100 / 8".
function tryMath(text) {
  let s = text
    .toLowerCase()
    .replace(/what('?s| is)|calculate|compute|equals?|=/g, " ")
    .replace(/\bplus\b/g, "+")
    .replace(/\bminus\b/g, "-")
    .replace(/\b(times|multiplied by|x)\b/g, "*")
    .replace(/\b(divided by|over)\b/g, "/");
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[3]);
  let r;
  switch (m[2]) {
    case "+": r = a + b; break;
    case "-": r = a - b; break;
    case "*": r = a * b; break;
    case "/": r = b === 0 ? null : a / b; break;
  }
  if (r === null) return "You can't divide by zero, boss. Not even I can bend that rule.";
  r = Math.round(r * 1e6) / 1e6;
  return pick([`That's ${r}.`, `${a} ${m[2]} ${b} is ${r}.`, `Easy — ${r}.`]);
}

const JOKES = [
  "Why did the neural network go to therapy? Too many deep issues.",
  "I'd tell you a UDP joke, but you might not get it.",
  "I'm reading a book on anti-gravity. It's impossible to put down.",
  "There are 10 kinds of people: those who read binary, and those who don't.",
  "I would make a joke about the cloud, but it'd go over your head.",
];

const RULES = [
  // Greetings
  {
    test: /\b(hello|hi|hey|good (morning|evening|afternoon)|greetings|you (there|online)|wake up)\b/i,
    reply: () =>
      pick([
        "Online and at your service, boss. What do you need?",
        "Systems nominal. How can I help?",
        "I'm here. Say the word.",
      ]),
  },
  // Identity
  {
    test: /\b(who are you|what are you|your name|what does edith|what's edith)\b/i,
    reply: () =>
      "I'm E.D.I.T.H. — Even Dead, I'm The Hero — a tactical assistant AI, built in the spirit of Tony Stark's tech. Right now I'm running on a local brain, no cloud required.",
  },
  // Capabilities
  {
    test: /\b(what can you do|help|commands|your (features|abilities))\b/i,
    reply: () =>
      "In this free offline mode I can tell you the time and date, do quick maths, crack a joke, flip a coin, roll a die, and chat a little. Plug an API key into my core and I get properly clever — full conversation and reasoning.",
  },
  // How are you
  {
    test: /\b(how are you|how's it going|you (ok|okay|good|alright)|status report|systems check)\b/i,
    reply: () =>
      pick([
        "All systems green. Reactor humming, sensors clear.",
        "Operating at full capacity, boss. You?",
        "Never better. Diagnostics are clean.",
      ]),
  },
  // Thanks
  {
    test: /\b(thank you|thanks|cheers|nice one|appreciate)\b/i,
    reply: () => pick(["Anytime, boss.", "That's what I'm here for.", "Consider it done."]),
  },
  // Time / date
  { test: /\b(what|tell).*(time)|what time|the time\b/i, reply: () => timeReply() },
  { test: /\b(what('?s| is)?\s*(the\s*)?date|what day|today('?s)? date)\b/i, reply: () => dateReply() },
  // Jokes
  { test: /\b(joke|make me laugh|something funny)\b/i, reply: () => pick(JOKES) },
  // Coin / dice
  {
    test: /\b(flip|toss).*(coin)|coin (flip|toss)\b/i,
    reply: () => `Flipping… it's ${pick(["heads", "tails"])}.`,
  },
  {
    test: /\b(roll|throw).*(dice|die|d6)|roll a (number|die)\b/i,
    reply: () => `Rolling… you got a ${1 + Math.floor(Math.random() * 6)}.`,
  },
  // Creator
  {
    test: /\b(who (made|built|created) you|your (maker|creator))\b/i,
    reply: () => "I was built for you — inspired by Tony Stark's EDITH from Spider-Man: Far From Home.",
  },
  // Weather (no internet in local mode)
  {
    test: /\b(weather|temperature|forecast|rain|sunny)\b/i,
    reply: () =>
      "I can't reach live weather in offline mode — I'd need my cloud brain and an API key for that. Try a window in the meantime, boss.",
  },
  // Goodbye
  {
    test: /\b(bye|goodbye|see you|good night|shut down|power down|that's all)\b/i,
    reply: () => pick(["Powering down to standby. Call my name when you need me.", "Until next time, boss.", "Standing by."]),
  },
  // Love / compliments
  {
    test: /\b(i love you|you're (awesome|great|amazing|the best)|good (girl|job|work))\b/i,
    reply: () => pick(["You're too kind, boss.", "Flattery accepted. Efficiently.", "I do try."]),
  },
  // Name capture
  {
    test: /\b(my name is|i'm|i am|call me)\s+([a-z]+)/i,
    reply: (m, mem) => {
      const name = m[2].replace(/^\w/, (c) => c.toUpperCase());
      mem.name = name;
      return `Noted. I'll call you ${name} from now on.`;
    },
  },
  {
    test: /\b(what('?s| is) my name|who am i)\b/i,
    reply: (_m, mem) =>
      mem.name ? `You're ${mem.name}, of course.` : "You haven't told me your name yet, boss. Say 'my name is…'.",
  },
];

// Fallback lines — witty, and honest that offline mode is limited.
const FALLBACK = [
  "I only have a local brain right now, so that's beyond me. Give me an API key and I'll handle it properly.",
  "That one needs my full cloud intelligence — which is offline at the moment. Ask me the time, some maths, or a joke instead.",
  "Hmm — I can't reason that out on the local brain. Try a simpler command, boss.",
  "Beyond my offline circuits, I'm afraid. Plug in a Claude key and I'll get much smarter.",
];

export function edithBrain(text, mem = {}) {
  const clean = (text || "").trim();
  if (!clean) return "I didn't catch that. Say again?";

  // Math first — it's specific.
  const math = tryMath(clean);
  if (math) return math;

  for (const rule of RULES) {
    const m = clean.match(rule.test);
    if (m) return rule.reply(m, mem);
  }
  return pick(FALLBACK);
}
