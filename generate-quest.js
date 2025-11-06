#!/usr/bin/env node
/**
 * Minecraft Daily Quest generator (ESM, vanilla-safe)
 * - Writes: quests/YYYY-MM-DD.json and updates quests/index.json
 * - Timezone: America/New_York
 * - Deterministic weekly theme (ISO week seed); daily ramp Mon→Sun
 * - Holiday windows override base themes
 * - Strong validation + safe fallback
 *
 * Usage:
 *   node generate-quest.js
 *   node generate-quest.js --date=2025-11-05
 *   DATE=2025-11-05 node generate-quest.js
 */

import fs from "node:fs";
import path from "node:path";

/* ------------------------------- Date helpers ------------------------------ */
function nyDateString(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toUTCDate(isoDateStr) {
  const x = new Date(isoDateStr + "T00:00:00Z");
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

// ISO week info (Mon=0..Sun=6)
function getISOWeekInfo(isoDateStr) {
  const d = toUTCDate(isoDateStr);
  const dow = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() - dow + 3);
  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round((thursday - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return { isoYear, week, dow };
}

/* --------------------------------- RNG ------------------------------------ */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function strHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rngForWeek(isoYear, week) {
  return mulberry32(strHash(`${isoYear}-${week}-MCQUESTS`));
}
function pickN(rng, arr, n) {
  const copy = [...arr];
  const out = [];
  while (n-- > 0 && copy.length) {
    const i = Math.floor(rng() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

/* --------------------------- Safety / validation --------------------------- */
const BANNED = [
  "nether","the nether","end","the end",
  "villager","wandering trader","raid","trial","spire",
  "structure","shipwreck","ruins","stronghold","fortress","bastion","monument",
  "potion","brew","enchant","elytra","ender","ender pearl",
  "command","data pack","datapack","mod","plugin","cartography",
  "archaeology","archeology","brush","sniffer"
];
function isSafe(text) {
  return typeof text === "string" && !BANNED.some(k => text.toLowerCase().includes(k));
}
function validateQuest(q) {
  return Boolean(
    q && typeof q.id === "string" && q.id === q.date &&
    isSafe(q.title) && isSafe(q.theme) &&
    Array.isArray(q.steps) && q.steps.length >= 1 && q.steps.length <= 3 &&
    q.steps.every(isSafe)
  );
}

/* --------------------------------- Themes --------------------------------- */
// BASE_THEMES and HOLIDAY_THEMES are copied from your earlier CommonJS script (unchanged in content)
const BASE_THEMES = [
  {
    key: "Farming Week",
    color: "#6ab04c",
    lore: "Nurture the land and stock your pantry.",
    biomeHints: ["Any","Plains","Forest","River","Beach"],
    warmups: [
      "Collect 20 logs and craft a crafting table, a wooden hoe, and a chest.",
      "Till soil near water and plant at least 10 seeds of any kind.",
      "Craft a composter and make at least 1 bone meal.",
      "Harvest 12 wheat or a mix of carrots/potatoes and store them in a chest.",
      "Craft a bucket and water your field with a small trench or puddle."
    ],
    core: [
      "Expand to 3 crop types (any you have) and replant what you harvest.",
      "Breed any two animals (chickens with seeds; cows/sheep with wheat; pigs with carrots).",
      "Place 12 torches around the farm to keep it safe at night.",
      "Make 3 composters and feed extras until you get 3 bone meal.",
      "Create a tiny greenhouse: walls of any block and at least 4 glass windows."
    ],
    stretch: [
      "Plant 4 saplings (any mix) and fence the area.",
      "Craft 4 bread and cook 4 other foods (any mix).",
      "Hydrate all tilled soil and plant 20 crops.",
      "Build a fenced pen and move two animals into it."
    ],
    rewards: [
      "A neatly labeled pantry chest","A stack of seeds","A cozy torch-lit farm","A tidy orchard row"
    ]
  },
  {
    key: "Builder Week",
    color: "#f0932b",
    lore: "Shape the world with safe shelters and style.",
    biomeHints: ["Any","Forest","Taiga","Hills","Birch Forest"],
    warmups: [
      "Gather 64 blocks of any building material (wood, stone, or mixed).",
      "Smelt 8 sand into glass and set at least 2 windows in your base.",
      "Place a door, pressure plate, and a few torches for a welcoming entrance.",
      "Craft a set of stone tools and a spare furnace for your workshop.",
      "Make a roof line with slabs or stairs along one side of your base."
    ],
    core: [
      "Expand your home to at least 5×5×3 inside and light it to be mob-safe.",
      "Add a crafting table, furnace, chest, bed, and one decorative block.",
      "Lay a 10-block path from your door using any block type.",
      "Build a porch or balcony with fences as railings.",
      "Create a storage wall with 4 chests and labels."
    ],
    stretch: [
      "Add a second room or loft with stairs or ladder.",
      "Install 8 more glass blocks and a skylight.",
      "Mix 3 block types on your facade for texture.",
      "Light the perimeter with 20 torches (no dark spots)."
    ],
    rewards: [
      "A proud screenshot of your build","A tidy workshop corner","A labeled storage wall","A sunny skylight"
    ]
  },
  {
    key: "Explorer Week",
    color: "#22a6b3",
    lore: "Venture safely, gather resources, and return with stories.",
    biomeHints: ["Any","Plains","Forest","Beach","River","Hills"],
    warmups: [
      "Craft a boat and take a short paddle (about 300 blocks—estimate is fine).",
      "Craft 16 torches and a spare stone pickaxe for your journey.",
      "Collect 10 different block types and bring them back home.",
      "Cook 5 foods (any mix) to pack as snacks.",
      "Place a 6-block waypoint pillar with a torch on top near your base."
    ],
    core: [
      "Gather 24 coal or make 16 charcoal for lighting.",
      "Mine 32 cobblestone and 8 iron ore if you see any; smelt what you find.",
      "Collect 6 mushrooms total (red/brown) from caves/shade.",
      "Explore for a few minutes and safely return to base (no map needed).",
      "Light a small cave entrance with 8 torches and gather common ores you see."
    ],
    stretch: [
      "Create a safe outpost: a bed, chest, furnace, and torch ring at a new spot.",
      "Bridge a small gap or river to make travel easier next time.",
      "Build a 7-block watchtower with ladder access and a torch on top.",
      "Return with a full stack of any useful block you found."
    ],
    rewards: [
      "A scenic lookout tower","A stocked travel chest","A safe cave entryway","A trusty docked boat"
    ]
  },
  {
    key: "Cozy Base Week",
    color: "#be2edd",
    lore: "Comfort and order—make it feel like home.",
    biomeHints: ["Any","Plains","Forest","Taiga","River"],
    warmups: [
      "Craft a bed of any color and set your spawn.",
      "Place a campfire and cook at least 2 foods on it.",
      "Label 3 chests with signs or item frames.",
      "Place 12 torches in your rooms for cozy lighting.",
      "Add a flower pot or a small plant corner."
    ],
    core: [
      "Create a kitchen nook: furnace/smoker, crafting table, and a food chest.",
      "Make a bedroom corner: bed, chest, and a window with glass.",
      "Build a sitting area using stairs/slabs as chairs and a table.",
      "Fence a small garden right outside your door.",
      "Organize your items so every chest has a purpose."
    ],
    stretch: [
      "Add a fireplace feature (campfire behind stairs/slabs).",
      "Decorate walls with mixed blocks or frames.",
      "Build a small basement or attic storage room.",
      "Light your yard perimeter so nights feel safe."
    ],
    rewards: [
      "A homey bedroom snapshot","A tidy kitchen corner","A charming front garden","An organized attic"
    ]
  },
  {
    key: "Survival Skills Week",
    color: "#eb4d4b",
    lore: "Stay safe, prepare smart, master day-one essentials.",
    biomeHints: ["Any","Plains","Forest","Hills","Birch Forest"],
    warmups: [
      "Craft a shield if you have 1 iron; otherwise craft extra torches.",
      "Make spare tools (stone pickaxe and axe).",
      "Cook 5 foods (any) and keep them on your hotbar.",
      "Collect 24 cobblestone and 16 logs for supplies.",
      "Set your spawn and reinforce your door for night safety."
    ],
    core: [
      "Light 20 torches around your base and paths.",
      "Smelt 8 sand into glass to improve visibility and safety.",
      "If you find iron, craft shears and gather 1 wool from a sheep.",
      "Build a 5×5×3 safe room with a door and two windows.",
      "Craft a water bucket and practice a gentle descent from a small height."
    ],
    stretch: [
      "Dig an escape tunnel or a second exit from your base.",
      "Place a torch way every ~8–10 blocks along a route.",
      "Craft backup gear for future adventures.",
      "Make a mob-safe mine entrance with a door and lights."
    ],
    rewards: [
      "A fortress-cozy base","A well-lit neighborhood","A backup gear chest","A guarded mine entrance"
    ]
  }
];

const HOLIDAY_THEMES = [
  {
    key: "Halloween Week",
    color: "#ff7518",
    from: { month: 10, day: 25 }, to: { month: 10, day: 31 },
    lore: "Spooky coziness—safe lights, pumpkins, and night-ready bases.",
    biomeHints: ["Any","Forest","Taiga","Hills"],
    warmups: [
      "Gather 16 pumpkins or carve 6 jack-o'-lanterns with torches.",
      "Place 12 torches along a path to make a safe trick-or-treat route.",
      "Craft a scarecrow vibe near crops with fences and a jack-o'-lantern.",
      "Cook 5 foods and stock a 'treat chest' at your door.",
      "Build a tiny spooky porch with fences and a lantern."
    ],
    core: [
      "Light up your yard so no dark spots remain.",
      "Decorate your base with orange/black accents using any blocks.",
      "Create a 7-block lookout with a torch or lantern on top.",
      "Fence a small safe area where friends can gather at night.",
      "Make a cozy room with windows to watch the stars."
    ],
    stretch: [
      "Build a mini haunted garden with mushrooms and path blocks.",
      "Add hidden lighting (torches under leaves/slabs) for ambience.",
      "Make a pumpkin patch with rows and a fence gate.",
      "Set up a tiny 'costume rack' with armor stands if you have them."
    ],
    rewards: ["Spooky porch vibes","A glowing pumpkin patch","A lantern-lit yard","A star-watching nook"]
  },
  {
    key: "Winter Lights Week",
    color: "#74b9ff",
    from: { month: 12, day: 20 }, to: { month: 12, day: 31 },
    lore: "Warm lights in the cold—cozy builds and bright paths.",
    biomeHints: ["Any","Taiga","Snowy Plains","Forest"],
    warmups: [
      "Place 20 torches along paths to create a bright walkway.",
      "Smelt 12 sand into glass for big windows.",
      "Craft a fireplace feature with a campfire behind stairs/slabs.",
      "Cook 6 foods to share with friends.",
      "Add a spruce-style decoration (logs, leaves, or fences)."
    ],
    core: [
      "Build a lodge room with bed, chest, crafting table, and furnace.",
      "Make a glass bay window or skylight to let light in.",
      "Set up a decorated front area with leaves, fences, and lanterns/torches.",
      "Create a sledding hill look: snow layers or stairs for fun.",
      "Light the perimeter so no mobs can sneak close."
    ],
    stretch: [
      "Add an outdoor light tree using fences and torches/lanterns.",
      "Craft extra blankets (beds) for guests and place them.",
      "Build a warm kitchen corner with a smoker if you have one.",
      "Create a small frozen-pond scene with a bench (stairs) nearby."
    ],
    rewards: ["A bright winter path","A cozy lodge room","A bay-window view","A festive front yard"]
  },
  {
    key: "New Year Kickoff",
    color: "#fdcb6e",
    from: { month: 1, day: 1 }, to: { month: 1, day: 7 },
    lore: "Fresh starts—organize, label, and light the way forward.",
    biomeHints: ["Any","Plains","Forest","Beach"],
    warmups: [
      "Label 4 chests and sort items neatly.",
      "Craft spare stone tools and store backups.",
      "Place 16 torches to make your area bright.",
      "Smelt 8 sand into glass and add windows.",
      "Cook 5 foods and fill an 'adventure box' chest."
    ],
    core: [
      "Build a to-do board with signs and place it in your base.",
      "Make a safe mine entrance with door and lights.",
      "Create a small farm with water and fences.",
      "Add a second room or corner dedicated to storage.",
      "Lay a 12-block path connecting base to farm or mine."
    ],
    stretch: [
      "Raise a 7-block watchtower with a torch beacon.",
      "Fence your perimeter to guide future paths.",
      "Craft extra gear sets for future adventures.",
      "Landscape with 3 block types for a clean look."
    ],
    rewards: ["A labeled storage wall","A safe mine entry","A tidy farm corner","A bright base perimeter"]
  },
  {
    key: "Spring Garden Week",
    color: "#55efc4",
    from: { month: 4, day: 10 }, to: { month: 4, day: 17 },
    lore: "Fresh growth—beds, paths, and peaceful green spaces.",
    biomeHints: ["Any","Plains","Forest","River"],
    warmups: [
      "Plant 12 seeds and water them nearby.",
      "Craft a composter and create 2 bone meal.",
      "Add a flower bed with fences and a gate.",
      "Place 12 torches around garden paths.",
      "Cook 5 foods for a garden picnic chest."
    ],
    core: [
      "Build a glass-window garden shed: crafting table, chest, furnace.",
      "Create a seating area with slabs/stairs and a table.",
      "Mix 3 block types to decorate the garden edges.",
      "Fence off a small pond with a bench (stairs).",
      "Replant crops so the garden keeps producing."
    ],
    stretch: [
      "Expand to 3 crop types and keep them hydrated.",
      "Add a leaf archway or trellis (fences + leaves).",
      "Create a compost corner with 3 composters.",
      "Connect garden to base with a lit path."
    ],
    rewards: ["A peaceful pond bench","A tidy garden shed","A blooming flower bed","A glowing path home"]
  },
  {
    key: "Summer Beach Week",
    color: "#ffeaa7",
    from: { month: 7, day: 1 }, to: { month: 7, day: 7 },
    lore: "Sunny builds—piers, paths, and picnic spots.",
    biomeHints: ["Any","Beach","River","Plains"],
    warmups: [
      "Craft a boat and take a relaxing paddle.",
      "Build a small pier with slabs/fences.",
      "Place 12 torches along the shoreline path.",
      "Cook 5 foods for a beach picnic chest.",
      "Add shade: a small canopy with slabs and fences."
    ],
    core: [
      "Create a lifeguard-style perch (7-block tower with ladder).",
      "Make a boardwalk path with wood blocks/slabs.",
      "Build a changing-hut room with door, chest, and torch.",
      "Add decorative details using signs and item frames.",
      "Connect the beach to your base with a lit path."
    ],
    stretch: [
      "Expand the pier and add lanterns or more torches.",
      "Create a fishing corner with a bench (stairs).",
      "Landscape with sand/gravel/wood patterning.",
      "Add a glow-at-night shoreline (hidden lights)."
    ],
    rewards: ["A sunny pier view","A cozy boardwalk","A beach picnic chest","A glowing shoreline"]
  }
];

/* ----------------------- Difficulty ramp & composition --------------------- */
function planForDow(dow) {
  const count = [1,2,2,2,3,3,3][dow];
  const mix = [
    ["warmup"],
    ["warmup","core"],
    ["core","core"],
    ["core","core"],
    ["core","core","stretch"],
    ["warmup","core","stretch"],
    ["core","stretch","stretch"],
  ][dow];
  return { count, mix };
}

/* ------------------------- Theme choosing (holiday) ------------------------ */
function dateInWindow(dateStr, win) {
  if (!win?.from || !win?.to) return false;
  const dt = toUTCDate(dateStr);
  const y = dt.getUTCFullYear();
  const start = new Date(Date.UTC(y, win.from.month - 1, win.from.day, 0, 0, 0));
  const end   = new Date(Date.UTC(y, win.to.month - 1, win.to.day, 23, 59, 59));
  return dt >= start && dt <= end;
}
function chooseThemeForDate(dateStr, rng) {
  const holiday = HOLIDAY_THEMES.find(win => dateInWindow(dateStr, win));
  if (holiday) return holiday;
  if (!Array.isArray(BASE_THEMES) || BASE_THEMES.length === 0) return null;
  const idx = Math.floor(rng() * BASE_THEMES.length);
  return BASE_THEMES[idx] ?? null;
}

/* ------------------------------ Step selection ----------------------------- */
function stepsForDay(theme, dow, rng) {
  const { count, mix } = planForDow(dow);
  const warmups = theme.warmups || [];
  const core    = theme.core || [];
  const stretch = theme.stretch || [];
  const picks = [];

  for (const slot of mix.slice(0, count)) {
    if (slot === "warmup") picks.push(...(warmups.length ? pickN(rng, warmups, 1) : pickN(rng, core, 1)));
    if (slot === "core")   picks.push(...(core.length ? pickN(rng, core, 1) : pickN(rng, warmups, 1)));
    if (slot === "stretch")picks.push(...(stretch.length ? pickN(rng, stretch, 1) : pickN(rng, core, 1)));
  }

  while (picks.length < count) {
    if (core.length) picks.push(...pickN(rng, core, 1));
    else if (warmups.length) picks.push(...pickN(rng, warmups, 1));
    else if (stretch.length) picks.push(...pickN(rng, stretch, 1));
    else break;
  }
  const seen = new Set();
  const dedup = picks.filter(s => !seen.has(s) && seen.add(s));
  return dedup.filter(isSafe).slice(0, count);
}

/* ----------------------------- Build & fallback ---------------------------- */
function hardFallback(date) {
  return {
    title: "Vanilla Daily Quest",
    theme: "Cozy Base (Fallback)",
    color: "#888888",
    id: date,
    date,
    lore: "Simple, seed-agnostic goals—no commands needed.",
    biome_hint: "Any",
    reward: "A cozy, well-lit home base",
    steps: [
      "Gather 64 blocks and add a small room to your base.",
      "Place 12 torches inside and 8 outside to keep the area safe."
    ],
    rules: [
      "Java & Bedrock supported. No commands, no mods, any seed.",
      "All steps are optional—stay safe and have fun.",
      "No special structures or dimensions are required."
    ],
    redo_hint: "If something feels off, pick a similar step or rerun the generator."
  };
}

function buildQuest(date) {
  const { isoYear, week, dow } = getISOWeekInfo(date);
  const rng = rngForWeek(isoYear, week);
  const theme = chooseThemeForDate(date, rng) || {
    key: "Cozy Base Week",
    color: "#be2edd",
    lore: "Comfort and order—make it feel like home.",
    biomeHints: ["Any","Plains","Forest","Taiga","River"],
    warmups: ["Place 12 torches in your rooms for cozy lighting."],
    core: ["Create a kitchen nook: furnace/smoker, crafting table, and a food chest."],
    stretch: ["Light your yard perimeter so nights feel safe."],
    rewards: ["A homey bedroom snapshot"]
  };

  const steps = stepsForDay(theme, dow, rng);

  const quest = {
    title: "Vanilla Daily Quest",
    theme: theme.key,
    color: theme.color || "#5c7cfa",
    id: date,
    date,
    lore: theme.lore,
    biome_hint: (theme.biomeHints || ["Any"])[Math.floor(rng() * (theme.biomeHints || ["Any"]).length)] || "Any",
    reward:
      (theme.rewards || ["Bragging Rights"])[Math.floor(rng() * (theme.rewards || ["Bragging Rights"]).length)],
    steps,
    rules: [
      "Java & Bedrock supported. No commands, no mods, any seed.",
      "All steps are optional—keep it fun and safe.",
      "No special structures or other dimensions are required."
    ],
    redo_hint: "Swap any step with another from the same theme or rerun the generator."
  };

  return validateQuest(quest) ? quest : hardFallback(date);
}

/* --------------------------------- I/O ------------------------------------ */
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

/* --------------------------------- Main ----------------------------------- */
(function main() {
  const cliDate = process.argv.find(a => a.startsWith("--date="))?.split("=")[1];
  const DATE = cliDate || process.env.DATE || nyDateString();

  const OUT_DIR = path.join(process.cwd(), "quests");
  const OUT_PATH = path.join(OUT_DIR, `${DATE}.json`);
  const INDEX_PATH = path.join(OUT_DIR, "index.json");

  ensureDir(OUT_DIR);

  const quest = buildQuest(DATE);
  fs.writeFileSync(OUT_PATH, JSON.stringify(quest, null, 2));

  const index = readJSON(INDEX_PATH, []);
  const set = new Set([DATE, ...index]);
  const updated = Array.from(set).sort().reverse();
  fs.writeFileSync(INDEX_PATH, JSON.stringify(updated, null, 2));

  console.log(`Wrote quests/${DATE}.json and updated quests/index.json`);
})();
