// E.D.I.T.H. — player shirt-number lookups (via TheSportsDB free API, no key).
// Handles "what number is Haaland?" and "who wears 9 for City?" with live squad
// data. Only intercepts shirt-number questions; everything else falls through
// to EDITH's normal brain.

import { matchTeam } from "./sports.js";

// Trim filler and punctuation from a captured player/team name.
function clean(s) {
  return (s || "")
    .replace(/[?!.]+$/g, "")
    .replace(/^\s*(the|is|for|of|does|at)\s+/i, "")
    .trim();
}

// Returns a spoken answer, or null if this isn't a shirt-number question.
export async function tryPlayer(text) {
  const t = text.trim();
  const hasNumberWord = /\b(number|no\.?|shirt|jersey|squad number|#)\b/i.test(t) || /\bwears?\b/i.test(t);
  if (!hasNumberWord) return null;

  let m;

  // --- NUMBER → player: "who wears 9 for City", "City number 10", "who is #7 at Arsenal" ---
  let num = null,
    teamText = null;
  if ((m = t.match(/\b(?:wears?|number|no\.?|shirt|jersey|#)\s*(\d{1,2})\b[^0-9]*?\b(?:for|at|of)\s+(.+)/i))) {
    num = m[1];
    teamText = m[2];
  } else if ((m = t.match(/\b(.+?)(?:'s)?\s+(?:number|no\.?|shirt|jersey|#)\s*(\d{1,2})\b/i))) {
    teamText = m[1];
    num = m[2];
  }
  if (num && teamText) {
    const team = matchTeam(teamText) || clean(teamText);
    try {
      const res = await fetch(`/api/player?team=${encodeURIComponent(team)}&number=${encodeURIComponent(num)}`);
      const data = await res.json();
      if (data.error || !data.player) {
        return `I can't find who wears number ${num} for ${data.team || team}, boss — the squad list may be incomplete.`;
      }
      const pos = data.position ? ` (${data.position})` : "";
      return `Number ${num} for ${data.team} is ${data.player}${pos}.`;
    } catch {
      return "I can't reach the squad data right now, boss.";
    }
  }

  // --- NAME → number: "what number is Haaland", "Haaland's shirt number", "what number does X wear" ---
  let name = null;
  if ((m = t.match(/what(?:'?s| is)?\s+(?:the\s+)?(?:shirt\s+)?(?:squad\s+)?(?:number|no\.?)\s+(?:is|of|for|does)?\s*(.+?)(?:\s+wear\w*)?[?!.]*$/i))) {
    name = m[1];
  } else if ((m = t.match(/(.+?)(?:'s)\s+(?:shirt\s+|squad\s+)?(?:number|no\.?)\b/i))) {
    name = m[1];
  } else if ((m = t.match(/what\s+(?:shirt\s+)?(?:number|no\.?)\s+does\s+(.+?)\s+wear/i))) {
    name = m[1];
  }
  name = clean(name);
  if (name) {
    try {
      const res = await fetch(`/api/player?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (data.error || !data.player) {
        return `I couldn't find a player called ${name}, boss.`;
      }
      const at = data.team ? ` for ${data.team}` : "";
      if (data.number) {
        return `${data.player} wears number ${data.number}${at}.`;
      }
      const pos = data.position ? `, a ${data.position},` : "";
      return `${data.player}${pos} plays${at}, but I don't have a shirt number listed for them, boss.`;
    } catch {
      return "I can't reach the player data right now, boss.";
    }
  }

  return null;
}
