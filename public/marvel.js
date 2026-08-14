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
