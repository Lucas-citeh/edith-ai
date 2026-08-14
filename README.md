# E.D.I.T.H. — a Far From Home style AI

> *"Even Dead, I'm The Hero."*

A browser-based AI assistant in the spirit of Tony Stark's EDITH from *Spider-Man: Far From Home*: a glowing blue holographic HUD that **listens to your voice, thinks with Claude, and talks back** — with a wake word, conversational memory, and an audio-reactive arc-reactor.

```
 E.D.I.T.H.                                    ● LISTENING   14:32:07
 Even Dead I'm The Hero
 ────────────────────────────────────────────────────────────────────
                          ╭───────────╮        │  TRANSCRIPT   [CLEAR]
                        ╭─┤   ((( ● ))) ├─╮     │  ────────────────────
                        │ ╰───────────╯   │     │  OPERATOR
                        │   scanning...   │     │   what's the time?
                        ╰─────────────────╯     │  E.D.I.T.H.
              "Say EDITH or tap the reactor."   │   It's 14:32, boss.
 ────────────────────────────────────────────────────────────────────
 [ 🎙 HOLD / TAP TO TALK ]  [ …type a command      ] [SEND]  ☑ wake ☑ voice
```


## Features

- 🎙 **Voice control** — speak to EDITH and hear her reply (Web Speech API, no extra installs)
- 🗣 **Wake word** — say **"EDITH"** hands-free to activate, then give your command
- 🧠 **Claude as the brain** — real reasoning via the Anthropic API (`claude-opus-4-8`), streamed live
- 💾 **Conversational memory** — she remembers the whole session for follow-ups
- 🔵 **Holographic HUD** — Stark-tech rings, scanning sweep, and a reactor that pulses to her voice
- ⌨️ **Type instead** — a text box for when you can't talk out loud

## Requirements

- **Node.js 18+**
- A **Chromium browser** (Chrome or Edge) for voice — Safari/Firefox can still type. Voice needs `localhost` or HTTPS to grant mic access.
- A **brain** — EDITH picks the best one available, in this order:
  1. **Claude** (paid, smartest) — set `ANTHROPIC_API_KEY` in `.env` (key from https://console.anthropic.com/)
  2. **Ollama** (free local AI) — install Ollama, run a model; EDITH auto-detects it (see below)
  3. **Rule brain** (free, built-in) — no setup at all; handles time/date/maths/jokes/chat only

## Free local AI with Ollama (no API key, no cost)

```bash
brew install ollama          # once
ollama serve &               # start the local AI server
ollama pull llama3.2         # download a model (~2 GB, once)
```

With Ollama running, just start EDITH normally — she detects it and uses it automatically
(console shows `FREE local AI via Ollama`). Everything runs on your machine; nothing is sent
to the cloud. Swap models with `OLLAMA_MODEL=<name>` in `.env` (e.g. `llama3.1`, `qwen2.5`).

## Deploy as a public website (free, always-on) — Cloudflare Pages + Groq

The `functions/` folder makes EDITH deployable as an always-on public site whose brain
is **Groq's free cloud AI** (no local Mac needed). Free tier, no credit card.

1. **Get a free Groq API key** → https://console.groq.com → sign in → *API Keys* → *Create*. Copy it (starts with `gsk_`).
2. **Create a Cloudflare account** (free) → https://dash.cloudflare.com
3. In Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**, authorise GitHub, pick the **`edith-ai`** repo.
4. Build settings:
   - Framework preset: **None**
   - Build command: **(leave blank)**
   - Build output directory: **`public`**
5. Expand **Environment variables** and add:
   - `GROQ_API_KEY` = *your Groq key*
   - *(optional)* `GROQ_MODEL` = `llama-3.3-70b-versatile`
6. **Save and Deploy.** In ~1 minute EDITH is live at `https://edith-ai.pages.dev` — voice and all.

If you add the key *after* the first deploy, set it in **Settings → Environment variables → Production**, then **Retry deployment** so the functions pick it up.

Rate limits: Groq's free tier caps requests — if it's hit, EDITH says "busy, try again" and never bills you.

## Setup

```bash
cd edith-ai
npm install
cp .env.example .env      # then paste your API key into .env
npm start
```

Open **http://localhost:3000**, click once to grant microphone access, and say **"EDITH"**.

> If you'd rather run the key command yourself, type `! cp .env.example .env` in this session.

## How to talk to her

| You do… | EDITH does… |
|---|---|
| Say **"EDITH, what's the weather like on Mars?"** | Wakes on her name, answers the command after it |
| **Hold / tap the mic button** (or tap the reactor) | Push-to-talk — say a command directly, no wake word |
| **Type in the box** and hit Send | Same, silently |
| Toggle **Wake word** / **Voice reply** | Turn hands-free listening or spoken replies on/off |
| Hit **CLEAR** | Wipes her memory for a fresh conversation |

## How it works

```
Browser (HUD + Web Speech)  ──POST /api/chat──▶  Node server  ──▶  Claude (Anthropic API)
      ▲  voice in / voice out                    holds API key      streams the reply back
      └───────────────  streamed text  ◀──────────────────────────────────┘
```

The **Node server** (`server.js`) holds your API key and proxies requests to Claude — browsers can't call the Anthropic API directly (it would expose the key and CORS blocks it). It streams Claude's reply token-by-token so EDITH starts talking almost immediately.

The **browser** (`public/`) handles the HUD, speech recognition (input), speech synthesis (her voice), the wake word, and the conversation history.

## Files

| File | Purpose |
|---|---|
| `server.js` | Static server + `/api/chat` streaming proxy to Claude; holds EDITH's persona |
| `public/index.html` | HUD markup |
| `public/style.css` | Stark-tech holographic styling + animations |
| `public/edith.js` | Voice in/out, wake word, memory, streaming client |
| `.env` | Your API key (create from `.env.example`) |

## Customising EDITH

- **Her personality / voice tone** → edit `SYSTEM_PROMPT` in `server.js`.
- **Which voice she speaks in** → `pickVoice()` in `public/edith.js` (prefers a British female voice; change the preference list).
- **The wake word** → the `WAKE` regex in `public/edith.js`.
- **The model** → set `EDITH_MODEL` in `.env`.

## Notes & limits

- EDITH is an **information and reasoning** assistant — no drones, no weapons, no smart glasses. It's the AI, not the hardware.
- Speech recognition quality and available voices depend on your browser/OS. Chrome on desktop gives the best result.
- She won't fabricate facts; if she doesn't know something, she'll say so.
