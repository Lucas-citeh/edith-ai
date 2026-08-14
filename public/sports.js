// E.D.I.T.H. — live football data (via TheSportsDB free API, no key/signup).
// Intercepts football questions and answers them with real fixtures/results,
// so EDITH can talk sport even though her AI brains have no internet.

// Known teams → the name TheSportsDB searches on. "city" defaults to Man City.
const TEAMS = [
  { rx: /\bman(?:chester)?\s*city\b|\bcity\b|\bcitizens\b|\bmcfc\b/i, name: "Manchester City" },
  { rx: /\bman(?:chester)?\s*(?:united|utd)\b|\bman\s*u\b|\bmufc\b/i, name: "Manchester United" },
  { rx: /\barsenal\b|\bgunners\b/i, name: "Arsenal" },
  { rx: /\bliverpool\b|\blfc\b/i, name: "Liverpool" },
  { rx: /\bchelsea\b|\bcfc\b/i, name: "Chelsea" },
  { rx: /\b(tottenham|spurs)\b/i, name: "Tottenham" },
  { rx: /\bnewcastle\b/i, name: "Newcastle" },
  { rx: /\baston\s*villa\b|\bvilla\b/i, name: "Aston Villa" },
  { rx: /\bbournemouth\b/i, name: "Bournemouth" },
  { rx: /\bbrighton\b/i, name: "Brighton" },
  { rx: /\bwest\s*ham\b/i, name: "West Ham" },
  { rx: /\beverton\b/i, name: "Everton" },
  { rx: /\bnottingham|\bforest\b/i, name: "Nottingham Forest" },
  { rx: /\breal\s*madrid\b/i, name: "Real Madrid" },
  { rx: /\bbar[cç]a\b|\bbarcelona\b/i, name: "Barcelona" },
];

const SPORTS_KW = /\b(match|matches|game|games|fixture|fixtures|play|playing|played|score|scores|result|results|won|win|beat|lost|lose|draw|drew|vs|versus|kick[- ]?off|opponent|fixture)\b/i;
const FOOTY_KW = /\b(football|footy|soccer|premier league|prem|epl|champions league|ucl)\b/i;
const LAST_KW = /\b(last|latest|recent|result|final score|score|won|win|beat|lost|lose|draw|drew|how did|yesterday|did they win)\b/i;
const NEXT_KW = /\b(next|upcoming|coming up|when|weekend|schedule|who.*play|do they play|are they playing|fixture)\b/i;

function sameTeam(a, b) {
  a = (a || "").toLowerCase();
  b = (b || "").toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

function niceDate(dateStr, timeStr) {
  if (!dateStr) return "soon";
  const iso = dateStr + (timeStr ? "T" + timeStr + "Z" : "T12:00:00Z");
  const d = new Date(iso);
  if (isNaN(d)) return dateStr;
  let out = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  if (timeStr) out += " at " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return out;
}

// Returns a spoken answer string, or null if this isn't a football question.
export async function trySports(text) {
  if (!SPORTS_KW.test(text)) return null;
  const teamMatch = TEAMS.find((x) => x.rx.test(text));
  if (!teamMatch && !FOOTY_KW.test(text)) return null;

  const team = teamMatch ? teamMatch.name : "Manchester City";
  const wantsLast = LAST_KW.test(text);
  const wantsNext = NEXT_KW.test(text);
  const type = wantsLast && !wantsNext ? "last" : "next";

  try {
    const res = await fetch(`/api/sports?team=${encodeURIComponent(team)}&type=${type}`);
    if (!res.ok) throw new Error(`sports ${res.status}`);
    const data = await res.json();
    const e = (data.events || [])[0];
    if (!e) {
      return type === "last"
        ? `I can't see a recent result for ${team}, boss.`
        : `I can't see an upcoming fixture for ${team} right now, boss.`;
    }

    const isHome = sameTeam(e.home, data.team);
    const opp = isHome ? e.away : e.home;

    if (type === "next") {
      const where = isHome ? "at home to" : "away to";
      const league = e.league ? ` in the ${e.league}` : "";
      return `Next up: ${data.team} play ${where} ${opp} on ${niceDate(e.date, e.time)}${league}. Come on you blues.`;
    }

    // last result
    const us = parseInt(isHome ? e.homeScore : e.awayScore, 10);
    const them = parseInt(isHome ? e.awayScore : e.homeScore, 10);
    if (isNaN(us) || isNaN(them)) {
      return `${data.team} last faced ${opp} on ${niceDate(e.date)}, but I don't have the final score, boss.`;
    }
    const verb = us > them ? "beat" : us < them ? "lost to" : "drew with";
    const flourish = us > them ? " Get in!" : us < them ? " We'll bounce back." : "";
    return `Last time out, ${data.team} ${verb} ${opp} ${us}-${them} on ${niceDate(e.date)}.${flourish}`;
  } catch {
    return "I can't reach the football feed right now, boss — check the connection and try again.";
  }
}
