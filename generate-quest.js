#!/usr/bin/env node
/**
 * Minecraft Daily Quest generator (Java & Bedrock, kid-friendly)
 * - Outputs quests/YYYY-MM-DD.json
 * - 1–3 steps, phrased as QUESTIONS
 * - 100% vanilla, seed-agnostic (no commands, no structures required)
 * - Easy tasks only; light weekday scaling
 * - Built-in validation + fallback redo if anything is off
 */

const fs = require("fs");
const path = require("path");

const OUT_DIR = "quests";
const DATE = process.env.DATE || new Date().toISOString().slice(0, 10);
const OUT = process.env.OUT || path.join(OUT_DIR, `${DATE}.json`);

/** -----------------------------------------------------------------------
 * SAFE, UNIVERSAL, KID-FRIENDLY BUILDING BLOCKS (Java + Bedrock parity)
 * Notes:
 *  - No Nether, no End, no villagers, no structures, no map/compass, no potions.
 *  - Everything is achievable on Day 1 anywhere (forests, plains, beaches, etc.).
 *  - When something needs fuel, allow any valid vanilla fuel.
 *  - Keep language clear and encouraging.
 * ----------------------------------------------------------------------*/

/** Core questions (super safe, early-game). */
const questionsCore = [
  // Wood + tools + furnace/torches path
  "Can you collect 20 logs of any wood and craft a crafting table and some sticks?",
  "Can you mine 20 cobblestone and use it to craft a furnace and a stone pickaxe?",
  "Can you make 16 torches using coal or charcoal and place them around a safe base area?",
  "Can you smelt 8 sand into 8 glass using any fuel in your furnace?",
  "Can you cook 5 pieces of any food (like raw meat, fish, or potatoes) using a furnace, smoker, or campfire?",

  // Farming + sustainable food
  "Can you plant at least 10 seeds (any kind) and water them nearby so they start growing?",
  "Can you harvest 12 wheat (or mix of carrots/potatoes) and craft 4 bread if you have wheat?",
  "Can you craft a composter and use it to turn extra plants into at least 1 bone meal?",

  // Simple shelter & safety
  "Can you build a small shelter (at least 5×5×3) with a door and a window made of glass?",
  "Can you craft a bed of any color and sleep to set your spawn point?",
  "Can you safely light up the area around your base with at least 20 torches to keep mobs away?",

  // Friendly animal tasks (no rare items required)
  "Can you feed and breed chickens using seeds to get at least 1 baby chick?",
  "Can you gently gather 1 wool by shearing a sheep with shears you crafted from 2 iron (if you find iron)?",
  "Can you lead an animal (like a cow, sheep, or chicken) into a tiny pen you build with fences?",

  // Exploration that’s always possible (no structures required)
  "Can you explore for a few minutes and bring back 10 different block types (like dirt, sand, gravel, logs, leaves, and stone)?",
  "Can you collect 6 mushrooms total (red or brown) from caves or shady spots and store them safely?",
  "Can you craft a boat and paddle across water for a short trip (about 300 blocks, just estimate)?",

  // Campfire (unlocks safe cooking + smoke signal)
  "Can you craft and place a campfire, then use it to cook at least 2 pieces of food?",
];

/** Extra questions (still safe; adds variety but stays easy). */
const questionsExtra = [
  "Can you craft a chest and organize today’s items so everything has a tidy spot?",
  "Can you craft a set of stone tools (pickaxe, axe, shovel, sword, and hoe)?",
  "Can you collect 16 coal (or make charcoal by smelting logs) so you never run out of torches?",
  "Can you make a tiny garden with a water source block and plant 3 different crops if you have them?",
  "Can you decorate your base with 4 different block types so it feels cozy?",
];

/** Biome “hints” are just flavor; none are required. */
const biomeHints = [
  "Any",
  "Plains",
  "Forest",
  "Taiga",
  "Birch Forest",
  "Savanna",
  "Beach",
  "River",
  "Hills",
];

/** Rewards are for fun—self-awarded brag tokens kids will enjoy. */
const rewards = [
  "A Proud Screenshot of Your Base",
  "A Shiny Stone Tool Set You Crafted",
  "A Cozy, Well-Lit Home Base",
  "A Stack of Torches for Tomorrow",
  "A Picnic of 5 Cooked Foods",
];

/** -----------------------------------------------------------------------
 * Utilities
 * ----------------------------------------------------------------------*/
function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  while (n-- > 0 && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

/** Steps count by weekday: Sun=1, Mon–Thu=2, Fri/Sat=3. */
function stepsCountForDate(d) {
  const dow = new Date(d).getUTCDay(); // 0 Sun … 6 Sat
  if (dow === 0) return 1;       // Sun
  if (dow === 5 || dow === 6) return 3; // Fri/Sat
  return 2;                      // Mon–Thu
}

/** Ensure every step is a question and from the safe pools. */
const BANNED_KEYWORDS = [
  // anything that risks incompatibility or frustration
  "nether", "end", "villager", "wandering trader", "structure",
  "shipwreck", "ruins", "stronghold", "fortress", "bastion",
  "potion", "brew", "enchant", "elytra", "ender",
  "command", "data pack", "datapack", "mod", "plugin",
  "map and compass", "cartography", "ocean monument",
];

function isSafeQuestion(q) {
  if (typeof q !== "string") return false;
  if (!q.trim().endsWith("?")) return false;
  const lower = q.toLowerCase();
  return !BANNED_KEYWORDS.some(k => lower.includes(k));
}

function validateQuest(quest) {
  if (!quest || !Array.isArray(quest.steps)) return false;
  if (quest.steps.length < 1 || quest.steps.length > 3) return false;
  return quest.steps.every(isSafeQuestion);
}

/** Build steps for a date, always questions, from safe pools only. */
function stepsForDate(d) {
  const needed = stepsCountForDate(d);
  const base = pickN(questionsCore, Math.min(needed, 3));
  // pad with extra if needed (still capped at 3)
  if (base.length < needed) {
    base.push(...pickN(questionsExtra, needed - base.length));
  }
  // ensure question marks
  const qSteps = base.map(s => s.trim().endsWith("?") ? s.trim() : `${s.trim()}?`);
  return qSteps.slice(0, 3);
}

/** Known good fallback (always valid) if generation somehow fails repeatedly. */
const HARDCODED_FALLBACK = {
  title: "Vanilla Daily Quest",
  id: DATE,
  date: DATE,
  lore: "Simple, seed-agnostic challenges you can finish in survival (Java & Bedrock).",
  biome_hint: "Any",
  reward: "A Proud Screenshot of Your Base",
  steps: [
    "Can you collect 20 logs, craft a crafting table, some sticks, and a stone pickaxe?",
    "Can you make 16 torches (coal or charcoal) and light up your base to keep mobs away?",
  ],
  rules: [
    "Vanilla survival only. No commands, no mods, any seed.",
    "All steps are optional—play safely and have fun.",
    "You never need special structures or dimensions for these quests.",
  ],
  redo_hint:
    "If something seems unclear, just rerun the generator or pick another simple goal you enjoy today!",
};

/** Attempts generation with validation and auto-redo. */
function buildQuestWithFallback(date, maxTries = 10) {
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const quest = {
      title: "Vanilla Daily Quest",
      id: date,
      date,
      lore:
        "Kid-friendly, seed-agnostic challenges you can finish in survival—no commands needed.",
      biome_hint: biomeHints[Math.floor(Math.random() * biomeHints.length)],
      reward: rewards[Math.floor(Math.random() * rewards.length)],
      steps: stepsForDate(date),
      rules: [
        "Java and Bedrock both supported. No commands, no mods, any seed.",
        "All steps are optional—stay safe, keep it fun.",
        "Everything here avoids special structures and other dimensions.",
      ],
      redo_hint:
        "If a step feels unclear in your world, swap it with another question you like or rerun the generator.",
    };

    if (validateQuest(quest)) return quest;
  }
  // If we somehow failed all attempts, return known-good fallback.
  return HARDCODED_FALLBACK;
}

/** I/O */
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const quest = buildQuestWithFallback(DATE);
ensureDir(OUT_DIR);
fs.writeFileSync(OUT, JSON.stringify(quest, null, 2));
console.log(`Wrote ${OUT}`);
