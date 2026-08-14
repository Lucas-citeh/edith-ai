// Cloudflare Pages Function — GET /api/sports?team=...&type=next|last
// Live football data via TheSportsDB free API (no key/signup). Mirrors the
// local server's /api/sports so EDITH answers sport in both places.

const SPORTSDB = "https://www.thesportsdb.com/api/v1/json/3";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const team = url.searchParams.get("team") || "Manchester City";
  const type = url.searchParams.get("type") === "last" ? "last" : "next";
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

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
    return json({ team: t.strTeam, type, events });
  } catch {
    return json({ error: "fetch_failed" }, 502);
  }
}
