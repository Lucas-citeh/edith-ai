// E.D.I.T.H. — Marvel / superhero knowledge (via the free akabab superhero-api,
// no key/signup). Answers "who is Spider-Man?", "how strong is Hulk?", etc.

// Popular heroes/villains EDITH recognises by name (so no keyword is needed).
const HEROES =
  /\b(spider-?man|iron man|hulk|thor|captain america|black widow|hawkeye|doctor strange|dr strange|black panther|scarlet witch|vision|ant-?man|wasp|captain marvel|star-?lord|groot|rocket raccoon|gamora|drax|thanos|loki|wolverine|deadpool|venom|carnage|magneto|professor x|storm|cyclops|jean grey|beast|nightcrawler|daredevil|punisher|ghost rider|silver surfer|galactus|ultron|green goblin|doctor octopus|doc ock|the thing|human torch|mister fantastic|invisible woman|nick fury|war machine|falcon|winter soldier|bucky|quicksilver|nova|moon knight|shang-?chi|thanos|magik|colossus|iron fist|luke cage|jessica jones|kingpin|mystique|sabretooth|juggernaut|red skull|green lantern|batman|superman|wonder woman|flash|aquaman|joker)\b/i;

const HERO_KW = /\b(superhero|super hero|marvel|avenger|avengers|x-?men|comic|power ?stats?|how (strong|powerful|fast|smart|tough) is|strength stat)\b/i;

function clean(s) {
  return (s || "")
    .replace(/[?!.]+$/g, "")
    .replace(/^\s*(the|is|a)\s+/i, "")
    .trim();
}

// Pull a likely character name out of the question.
function extractName(text) {
  const named = text.match(HEROES);
  if (named) return named[0];
  let m;
  if ((m = text.match(/\bhow (?:strong|powerful|fast|smart|tough) is\s+(.+?)[?!.]*$/i))) return clean(m[1]);
  if ((m = text.match(/\b(?:who(?:'?s| is)|tell me about|what(?:'?s| is)?|stats (?:for|on)|info on)\s+(.+?)[?!.]*$/i)))
    return clean(m[1]);
  if ((m = text.match(/(.+?)'s\s+(?:stats|powers?|power ?stats?|strength|profile)/i))) return clean(m[1]);
  return null;
}

async function fetchHero(name) {
  try {
    const res = await fetch(`/api/marvel?name=${encodeURIComponent(name)}`);
    const d = await res.json();
    return d && d.name ? d : null;
  } catch {
    return null;
  }
}

const STAT_KEYS = ["intelligence", "strength", "speed", "durability", "power", "combat"];
const total = (p) => STAT_KEYS.reduce((s, k) => s + (parseInt(p?.[k], 10) || 0), 0);

function stripName(s) {
  return clean(s)
    .replace(/^\s*in\s+a\s+fight\s+/i, "")
    // leading "who would win ", "who wins ", "would ", "will "
    .replace(/^\s*(?:who(?:'?s)?\s+)?(?:would\s+|will\s+|d\s+)?(?:win|beat|defeat)\s+/i, "")
    .replace(/^\s*(?:who(?:'?s)?|would|will)\s+/i, "")
    // trailing "who would win", "would win", "in a fight"
    .replace(/\s+who\b.*$/i, "")
    .replace(/\s+(?:would|will)\s+win.*$/i, "")
    .replace(/\s+in a fight.*$/i, "")
    .replace(/[?!.]+$/, "")
    .trim();
}

// "Who would win, Hulk or Thor?", "Iron Man vs Thanos", "would Spider-Man beat Venom?"
export async function tryBattle(text) {
  const t = text.trim();
  let m, a, b;
  if ((m = t.match(/\bbetween\s+(.+?)\s+and\s+(.+)/i))) [, a, b] = m;
  else if ((m = t.match(/\bwould\s+(.+?)\s+(?:beat|defeat|destroy|win against)\s+(.+)/i))) [, a, b] = m;
  else if ((m = t.match(/\b(.+?)\s+(?:vs\.?|versus)\s+(.+)/i))) [, a, b] = m;
  else if ((m = t.match(/\bwin.*?\b(.+?)\s+or\s+(.+)/i))) [, a, b] = m;
  if (!a || !b) return null;

  a = stripName(a);
  b = stripName(b);
  if (!a || !b) return null;

  const [da, db] = await Promise.all([fetchHero(a), fetchHero(b)]);
  if (!da || !db) return null; // not both heroes — let sports/AI handle it

  const ta = total(da.powerstats);
  const tb = total(db.powerstats);
  const winA = [];
  const winB = [];
  for (const k of STAT_KEYS) {
    const va = parseInt(da.powerstats?.[k], 10) || 0;
    const vb = parseInt(db.powerstats?.[k], 10) || 0;
    if (va > vb) winA.push(k);
    else if (vb > va) winB.push(k);
  }

  if (ta === tb) {
    return `Dead even, boss — ${da.name} and ${db.name} both score ${ta} across the board. Too close to call.`;
  }
  const win = ta > tb ? da : db;
  const lose = ta > tb ? db : da;
  const winCats = (ta > tb ? winA : winB).slice(0, 3).join(", ");
  const loseCats = (ta > tb ? winB : winA).slice(0, 2).join(" and ");
  const edge = Math.abs(ta - tb) <= 20 ? "just edges it" : "takes it comfortably";
  let out = `Tale of the tape — ${da.name} scores ${ta}, ${db.name} scores ${tb}. My analysis: ${win.name} ${edge}, boss.`;
  if (winCats) out += ` ${win.name} wins on ${winCats}.`;
  if (loseCats) out += ` ${lose.name} takes ${loseCats}.`;
  return out;
}

// Returns a spoken answer, or null if this isn't a superhero question.
export async function tryMarvel(text) {
  if (!HEROES.test(text) && !HERO_KW.test(text)) return null;
  const name = extractName(text);
  if (!name) return null;

  try {
    const res = await fetch(`/api/marvel?name=${encodeURIComponent(name)}`);
    const d = await res.json();
    if (d.error || !d.name) return null; // let the AI brain try instead

    const p = d.powerstats || {};
    const stat = (v) => (v === null || v === undefined || v === "null" ? "?" : v);
    const real = d.fullName && d.fullName !== "-" ? `real name ${d.fullName}, ` : "";
    const pub = (d.publisher || "").replace(" Comics", "") || "comic-book";
    const side = d.alignment === "bad" ? "villain" : "hero";

    // If the user asked about one specific stat, lead with it.
    const low = text.toLowerCase();
    let lead = "";
    if (/how strong|strength/.test(low)) lead = `${d.name}'s strength is ${stat(p.strength)} out of 100. `;
    else if (/how fast|speed/.test(low)) lead = `${d.name}'s speed is ${stat(p.speed)} out of 100. `;
    else if (/how smart|intelligence/.test(low)) lead = `${d.name}'s intelligence is ${stat(p.intelligence)} out of 100. `;
    else if (/how powerful|power/.test(low)) lead = `${d.name}'s power rating is ${stat(p.power)} out of 100. `;
    else if (/how tough|durab/.test(low)) lead = `${d.name}'s durability is ${stat(p.durability)} out of 100. `;

    const intro = lead || `${d.name} — ${real}a ${pub} ${side}. `;
    const stats = `Powerstats out of 100: strength ${stat(p.strength)}, speed ${stat(p.speed)}, intelligence ${stat(p.intelligence)}, durability ${stat(p.durability)}, combat ${stat(p.combat)}, power ${stat(p.power)}.`;
    const first = d.firstAppearance && d.firstAppearance !== "-" ? ` First appeared in ${d.firstAppearance}.` : "";
    return `${intro}${stats}${first}`;
  } catch {
    return null;
  }
}
