// Cloudflare Pages Function — GET /api/marvel?name=Spider-Man
// Marvel / superhero data via the free akabab superhero-api (no key). Mirrors
// the local server's /api/marvel.

const HERO_URL = "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/all.json";

let heroCache = null;
let heroCacheAt = 0;
async function allHeroes() {
  if (heroCache && Date.now() - heroCacheAt < 3600_000) return heroCache;
  const r = await fetch(HERO_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  heroCache = await r.json();
  heroCacheAt = Date.now();
  return heroCache;
}

function findHero(list, name) {
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const nq = norm(name);
  const marvel = list.filter((h) => h.biography?.publisher === "Marvel Comics");
  for (const pool of [marvel, list]) {
    const exact = pool.find((h) => norm(h.name) === nq);
    if (exact) return exact;
  }
  for (const pool of [marvel, list]) {
    const partial = pool.find((h) => norm(h.name).includes(nq) || nq.includes(norm(h.name)));
    if (partial) return partial;
  }
  return null;
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name") || "";
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  try {
    const h = findHero(await allHeroes(), name);
    if (!h) return json({ error: "not_found", name });
    return json({
      name: h.name,
      fullName: h.biography?.fullName,
      publisher: h.biography?.publisher,
      alignment: h.biography?.alignment,
      firstAppearance: h.biography?.firstAppearance,
      occupation: h.work?.occupation,
      powerstats: h.powerstats,
    });
  } catch {
    return json({ error: "fetch_failed" }, 502);
  }
}
