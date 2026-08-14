// Cloudflare Pages Function — GET /api/mode
// Tells the browser whether the cloud brain is configured. If the owner hasn't
// added a GROQ_API_KEY yet, we report "local" so the page falls back to the
// built-in rule brain instead of erroring.

import { resolveProvider } from "./chat.js";

export function onRequestGet({ env }) {
  const provider = resolveProvider(env);
  return new Response(
    JSON.stringify({
      backend: provider ? "cloud" : "local",
      model: provider ? provider.model : null,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
