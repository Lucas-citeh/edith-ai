// Cloudflare Pages Function — GET /api/player
//   ?name=Haaland            → that player's shirt number + info
//   ?team=Manchester City&number=9  → who wears that number
// Live squad data via TheSportsDB free API (no key). Mirrors the local server.

const SPORTSDB = "https://www.thesportsdb.com/api/v1/json/3";

function isRealPlayer(p) {
  return p.strPosition && !/manager|coach|ceo|president|owner|director|assistant/i.test(p.strPosition);
}
function nameMatch(a, b) {
  a = (a || "").toLowerCase();
  b = (b || "").toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}
async function squadOf(teamId) {
  const r = await fetch(`${SPORTSDB}/lookup_all_players.php?id=${teamId}`);
  const j = await r.json();
  return j.player || [];
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  const team = url.searchParams.get("team");
  const number = url.searchParams.get("number");
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

  try {
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

    if (name) {
      const s = await fetch(`${SPORTSDB}/searchplayers.php?p=${encodeURIComponent(name)}`);
      const sj = await s.json();
      const p0 = (sj.player || [])[0];
      if (!p0) return json({ error: "player_not_found", name });
      let num = p0.strNumber && p0.strNumber !== "null" ? p0.strNumber : null;
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
  } catch {
    return json({ error: "fetch_failed" }, 502);
  }
}
