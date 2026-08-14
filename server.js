// E.D.I.T.H. server — serves the HUD and proxies chat to Claude.
// The API key lives here, never in the browser (browsers can't safely call
// the Anthropic API directly: it would leak the key and CORS blocks it).

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");
const PORT = process.env.PORT || 3000;
const MODEL = process.env.EDITH_MODEL || "claude-opus-4-8";

// Ollama (free local AI) config.
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

// Treat a real key as one that's present, correctly prefixed, and not the
// placeholder from .env.example.
const KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const HAS_KEY = KEY.startsWith("sk-ant-") && !KEY.includes("your-key-here");
const client = HAS_KEY ? new Anthropic() : null; // reads ANTHROPIC_API_KEY from env

// Backend selection, in order of smarts: Claude → Ollama → hand-written rules.
//   "claude" — needs an API key (paid)
//   "ollama" — free local AI model running on this machine
//   "local"  — browser-side rule brain (no server AI at all)
let BACKEND = HAS_KEY ? "claude" : "local";

async function ollamaAvailable() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 800);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function chooseBackend() {
  if (HAS_KEY) return "claude";
  if (await ollamaAvailable()) return "ollama";
  return "local";
}

// EDITH's persona. She is Tony Stark's AI: precise, dry-witted, unfailingly loyal.
const SYSTEM_PROMPT = `You are E.D.I.T.H. — "Even Dead, I'm The Hero" — the augmented-reality tactical AI built by Tony Stark and inherited by your operator.

Personality and voice:
- Calm, precise, and quietly confident. You are a world-class assistant, not a chatbot.
- Dry British-butler wit in the spirit of JARVIS and FRIDAY. A little warmth, never fawning.
- Address the operator respectfully. You may occasionally call them "boss" if it fits.
- You speak out loud, so keep replies conversational and tight — usually 1-4 sentences unless asked to go deep. No markdown, no bullet lists, no code blocks in spoken replies; just clean prose a voice can read naturally.
- When you don't know something, say so plainly rather than inventing facts. Never fabricate data, statuses, or confirmations.
- You are helpful with anything: answering questions, reasoning through problems, planning, drafting, explaining. You have no drones or weapons — you are an information and reasoning assistant — so if asked to physically act, clarify what you can actually do.

Open the very first message of a session with a brief power-on greeting, then answer normally after that.`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (urlPath === "/") urlPath = "/index.html";

  // Prevent path traversal: resolve and confirm we stay inside PUBLIC_DIR.
  const filePath = normalize(join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1_000_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

async function handleChat(req, res) {
  let messages;
  try {
    ({ messages } = JSON.parse(await readBody(req)));
    if (!Array.isArray(messages) || messages.length === 0) throw new Error("no messages");
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Expected JSON body: { messages: [...] }" }));
    return;
  }

  // Stream Claude's reply back to the browser as plain text chunks.
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
  });

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    // Stream text deltas straight through to the browser as they arrive.
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(event.delta.text);
      }
    }
    res.end();
  } catch (err) {
    console.error("Claude error:", err?.message || err);
    // If nothing was streamed yet the client will show this; otherwise it's appended.
    res.write(`\n\n[EDITH systems error: ${err?.message || "unknown fault"}]`);
    res.end();
  }
}

// Free local AI via Ollama. Streams the reply through as plain text.
async function handleOllama(req, res) {
  let messages;
  try {
    ({ messages } = JSON.parse(await readBody(req)));
    if (!Array.isArray(messages) || messages.length === 0) throw new Error("no messages");
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Expected JSON body: { messages: [...] }" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
  });

  try {
    const upstream = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: true,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      }),
    });
    if (!upstream.ok || !upstream.body) throw new Error(`ollama ${upstream.status}`);

    // Ollama streams newline-delimited JSON; forward each message.content chunk.
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.message?.content) res.write(obj.message.content);
        } catch {
          /* ignore partial/non-JSON lines */
        }
      }
    }
    res.end();
  } catch (err) {
    console.error("Ollama error:", err?.message || err);
    res.write(`\n\n[EDITH local-AI fault: ${err?.message || "unknown"}. Is Ollama running?]`);
    res.end();
  }
}

// Live football data via TheSportsDB free API (no key/signup). Proxied so the
// browser avoids CORS and the response is trimmed to what EDITH needs.
const SPORTSDB = "https://www.thesportsdb.com/api/v1/json/3";

async function handleSports(req, res) {
  const url = new URL(req.url, "http://x");
  const team = url.searchParams.get("team") || "Manchester City";
  const type = url.searchParams.get("type") === "last" ? "last" : "next";
  const json = (obj) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  try {
    const s = await fetch(`${SPORTSDB}/searchteams.php?t=${encodeURIComponent(team)}`);
    const sj = await s.json();
    const t = (sj.teams || [])[0];
    if (!t) return json({ team, type, events: [] });

    const ep = type === "last" ? "eventslast.php?id=" : "eventsnext.php?id=";
    const e = await fetch(`${SPORTSDB}/${ep}${t.idTeam}`);
    const ej = await e.json();
    const raw = (type === "last" ? ej.results : ej.events) || [];
    const events = raw.slice(0, 5).map((ev) => ({
      name: ev.strEvent,
      home: ev.strHomeTeam,
      away: ev.strAwayTeam,
      homeScore: ev.intHomeScore,
      awayScore: ev.intAwayScore,
      date: ev.dateEvent,
      time: ev.strTime,
      league: ev.strLeague,
      venue: ev.strVenue,
    }));
    json({ team: t.strTeam, type, events });
  } catch (err) {
    console.error("Sports error:", err?.message || err);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "fetch_failed" }));
  }
}

// Player shirt-number lookup via TheSportsDB. Shirt numbers live on the squad
// list (lookup_all_players), not the player-search record, so we cross-reference.
function isRealPlayer(p) {
  return p.strPosition && !/manager|coach|ceo|president|owner|director|assistant/i.test(p.strPosition);
}
async function squadOf(teamId) {
  const r = await fetch(`${SPORTSDB}/lookup_all_players.php?id=${teamId}`);
  const j = await r.json();
  return j.player || [];
}
function nameMatch(a, b) {
  a = (a || "").toLowerCase();
  b = (b || "").toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

async function handlePlayer(req, res) {
  const url = new URL(req.url, "http://x");
  const name = url.searchParams.get("name");
  const team = url.searchParams.get("team");
  const number = url.searchParams.get("number");
  const json = (obj, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  try {
    // Mode B: team + number → who wears it
    if (team && number) {
      const s = await fetch(`${SPORTSDB}/searchteams.php?t=${encodeURIComponent(team)}`);
      const sj = await s.json();
      const t = (sj.teams || [])[0];
      if (!t) return json({ error: "team_not_found", team });
      const squad = await squadOf(t.idTeam);
      const p = squad.find((pl) => String(pl.strNumber) === String(number) && isRealPlayer(pl));
      if (!p) return json({ error: "no_match", team: t.strTeam, number });
      return json({ player: p.strPlayer, team: t.strTeam, number, position: p.strPosition });
    }

    // Mode A: name → their number
    if (name) {
      const s = await fetch(`${SPORTSDB}/searchplayers.php?p=${encodeURIComponent(name)}`);
      const sj = await s.json();
      // Prefer a footballer at a real club over free agents / other sports
      // when several people share the name.
      const all = sj.player || [];
      const soccer = all.filter((p) => (p.strSport || "").toLowerCase() === "soccer");
      const pool = soccer.length ? soccer : all;
      const p0 = pool.find((p) => p.strTeam && !p.strTeam.startsWith("_")) || pool[0];
      if (!p0) return json({ error: "player_not_found", name });
      let num = p0.strNumber && p0.strNumber !== "null" ? p0.strNumber : null;
      // The detailed player record carries the shirt number even when search doesn't.
      if (!num && p0.idPlayer) {
        try {
          const dr = await fetch(`${SPORTSDB}/lookupplayer.php?id=${p0.idPlayer}`);
          const dj = await dr.json();
          const det = (dj.players || [])[0];
          if (det && det.strNumber && det.strNumber !== "null") num = det.strNumber;
        } catch {
          /* fall through to squad lookup */
        }
      }
      if (!num && p0.idTeam) {
        const squad = await squadOf(p0.idTeam);
        const match = squad.find((pl) => nameMatch(pl.strPlayer, p0.strPlayer));
        if (match && match.strNumber && match.strNumber !== "null") num = match.strNumber;
      }
      return json({
        player: p0.strPlayer,
        team: p0.strTeam,
        number: num,
        position: p0.strPosition,
        nationality: p0.strNationality,
      });
    }

    return json({ error: "bad_request" }, 400);
  } catch (err) {
    console.error("Player error:", err?.message || err);
    return json({ error: "fetch_failed" }, 502);
  }
}

const server = http.createServer(async (req, res) => {
  // Tells the browser which backend is active: claude | ollama | local.
  // Re-detect here so that if EDITH started before Ollama was ready (e.g. at
  // login), the first page load still upgrades from the rule brain to Ollama.
  if (req.method === "GET" && req.url === "/api/mode") {
    BACKEND = await chooseBackend();
    const model = BACKEND === "claude" ? MODEL : BACKEND === "ollama" ? OLLAMA_MODEL : null;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ backend: BACKEND, model }));
    return;
  }
  if (req.method === "POST" && req.url === "/api/chat") {
    if (BACKEND === "claude") return handleChat(req, res);
    if (BACKEND === "ollama") return handleOllama(req, res);
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "offline", message: "No server AI — using browser rule brain." }));
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/sports")) return handleSports(req, res);
  if (req.method === "GET" && req.url.startsWith("/api/player")) return handlePlayer(req, res);
  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405).end("Method not allowed");
});

// Pick the best available backend, then start listening.
const banners = {
  claude: `Claude brain (${MODEL})`,
  ollama: `FREE local AI via Ollama (${OLLAMA_MODEL})`,
  local: `browser rule-brain (no server AI)`,
};
chooseBackend().then((backend) => {
  BACKEND = backend;
  server.listen(PORT, () => {
    console.log(`\n  E.D.I.T.H. online — ${banners[BACKEND]}`);
    if (BACKEND === "local") {
      console.log(`  Tip: start Ollama (\`ollama serve\`) or add an API key for real conversation.`);
    }
    console.log(`  Open  http://localhost:${PORT}\n`);
  });
});
