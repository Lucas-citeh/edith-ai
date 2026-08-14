// Cloudflare Pages Function — POST /api/chat
// Streams EDITH's reply from Groq (free cloud AI). The API key lives here as a
// Pages secret (env.GROQ_API_KEY), never in the browser.

const SYSTEM_PROMPT = `You are E.D.I.T.H. — "Even Dead, I'm The Hero" — the augmented-reality tactical AI built by Tony Stark and inherited by your operator.

Personality and voice:
- Calm, precise, and quietly confident. You are a world-class assistant, not a chatbot.
- Dry British-butler wit in the spirit of JARVIS and FRIDAY. A little warmth, never fawning.
- Address the operator respectfully. You may occasionally call them "boss" if it fits.
- You speak out loud, so keep replies conversational and tight — usually 1-4 sentences unless asked to go deep. No markdown, no bullet lists, no code blocks in spoken replies; just clean prose a voice can read naturally.
- When you don't know something, say so plainly rather than inventing facts. Never fabricate data, statuses, or confirmations.
- You are helpful with anything: answering questions, reasoning through problems, planning, drafting, explaining. You have no drones or weapons — you are an information and reasoning assistant — so if asked to physically act, clarify what you can actually do.

Open the very first message of a session with a brief power-on greeting, then answer normally after that.`;

// EDITH works with any free, OpenAI-compatible AI provider. Set whichever key
// you can get — the first one found wins. All stream in the same format.
export function resolveProvider(env) {
  if (env.GROQ_API_KEY)
    return { name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: env.GROQ_API_KEY, model: env.AI_MODEL || "llama-3.3-70b-versatile" };
  if (env.GEMINI_API_KEY)
    return { name: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: env.GEMINI_API_KEY, model: env.AI_MODEL || "gemini-2.0-flash" };
  if (env.OPENROUTER_API_KEY)
    return {
      name: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: env.OPENROUTER_API_KEY,
      model: env.AI_MODEL || "google/gemma-4-31b-it:free",
      headers: { "HTTP-Referer": "https://edith-ai.pages.dev", "X-Title": "EDITH" },
    };
  return null;
}

export async function onRequestPost({ request, env }) {
  let messages;
  try {
    ({ messages } = await request.json());
    if (!Array.isArray(messages) || messages.length === 0) throw new Error("no messages");
  } catch {
    return new Response(JSON.stringify({ error: "Expected JSON body: { messages: [...] }" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const provider = resolveProvider(env);
  if (!provider) {
    return new Response(
      "My cloud brain isn't wired up yet — the site owner still needs to add a free AI key (GROQ_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY).",
      { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const upstream = await fetch(provider.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.key}`,
      "Content-Type": "application/json",
      ...(provider.headers || {}),
    },
    body: JSON.stringify({
      model: provider.model,
      stream: true,
      max_tokens: 1024,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    const msg =
      upstream.status === 429
        ? "I'm getting a lot of requests right now — the free AI limit is maxed out. Give it a minute and try again, boss."
        : `[EDITH cloud-brain fault: ${upstream.status}. ${detail.slice(0, 200)}]`;
    return new Response(`\n\n${msg}`, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Groq streams OpenAI-style SSE ("data: {json}\n\n"); re-emit just the text.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  (async () => {
    const reader = upstream.body.getReader();
    let buf = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const obj = JSON.parse(data);
            const t = obj.choices?.[0]?.delta?.content;
            if (t) await writer.write(enc.encode(t));
          } catch {
            /* ignore keep-alive / partial lines */
          }
        }
      }
    } catch {
      await writer.write(enc.encode("\n\n[EDITH stream interrupted]"));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
