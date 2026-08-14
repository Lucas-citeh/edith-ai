// Cloudflare Pages Function — GET /api/mode
// Tells the browser whether the cloud brain is configured. If the owner hasn't
// added a GROQ_API_KEY yet, we report "local" so the page falls back to the
// built-in rule brain instead of erroring.

export function onRequestGet({ env }) {
  const configured = !!env.GROQ_API_KEY;
  return new Response(
    JSON.stringify({
      backend: configured ? "cloud" : "local",
      model: configured ? env.GROQ_MODEL || "llama-3.3-70b-versatile" : null,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
