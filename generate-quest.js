#!/usr/bin/env node
/**
 * Minecraft Daily Quest generator (vanilla-safe)
 * - Outputs quests/YYYY-MM-DD.json
 * - 1–3 steps
 * - Seed-agnostic, no commands/mods, no unobtainables
 * - Difficulty scales lightly by weekday
 */

const fs = require("fs");
const path = require("path");

const OUT_DIR = "quests";
const DATE = process.env.DATE || new Date().toISOString().slice(0, 10);
const OUT = process.env.OUT || path.join(OUT_DIR, `${DATE}.json`);

// ——— Canonical, seed-agnostic, vanilla-safe building blocks ———
const actionsCore = [
  // Gathering & basic crafting
  "Gather 20 oak logs and craft a crafting table, sticks, and a stone pickaxe.",
  "Mine and smelt iron to obtain 3 iron ingots; craft a bucket.",
  "Craft a shield and block at least one skeleton arrow.",
  "Collect 16 sand and smelt into 16 glass.",
  "Craft a boat and travel 300 blocks by water (estimating distance is fine).",

  // Food & farming
  "Plant wheat seeds and harvest at least 12 wheat.",
  "Cook any 5 raw meats or fish in a furnace, smoker, or campfire.",
  "Craft a composter and generate at least 1 bone meal from crops.",
  "Breed two cows (or two sheep, or two pigs).",

  // Utility & exploration (structure-free or common)
  "Place a campfire and use it to cook at least 2 items.",
  "Craft a map (paper + compass) and fully reveal at least 20% by exploring.",
  "Find and collect 16 coal (torches encouraged!).",
  "Craft a bed of any color and sleep to set your spawn.",

  // Beekeeping (vanilla-safe)
  "Find a bee nest or beehive; place a campfire underneath and shear it to collect at least 1 honeycomb.",

  // Mushrooms (vanilla-safe)
  "Collect at least 6 mushrooms (any mix of red and brown).",
];

const actionsAdv = [
  // Brewing (vanilla recipes only)
  "Brew a Potion of Swiftness (sugar + awkward potion) and drink it.",
  "Brew a Potion of Night Vision (golden carrot + awkward potion) and explore for 2 minutes.",
  // Suspicious stew (vanilla, no cauldron)
  "Craft a Suspicious Stew using a valid flower (e.g., Oxeye Daisy for Regeneration) and eat it.",

  // Trading (realistic outcomes)
  "Trade with any villager until you obtain at least 1 emerald.",
  "Ring a village bell and fend off a small group of nearby mobs at night (play it safe!).",

  // Treasure (shipwreck/ruins are common; allow fallback)
  "Loot a shipwreck **or** ocean ruins chest. If none found after 10 minutes, skip this step.",
];

const biomeHints = [
  "Any",
  "Plains",
  "Forest",
  "Taiga",
  "Birch Forest",
  "Savanna",
  "Desert (carry water!)",
  "Beach / Ocean",
  "Windswept Hills",
];

const rewards = [
  "Bragging Rights",
  "1 Emerald (self-awarded if you traded!)",
  "A fresh set of iron tools",
  "A stack of torches",
  "Potion supplies for tomorrow",
];

// Pick N items from an array without repeats
function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  while (n-- > 0 && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

// 1–3 steps. Slightly more on Fri/Sat.
function stepsForDate(d) {
  const dow = new Date(d).getUTCDay(); // 0 Sun … 6 Sat
  const base = dow === 5 || dow === 6 ? 3 : dow === 0 ? 1 : 2; // Fri/Sat=3, Sun=1, else=2
  const advChance = dow === 5 || dow === 6 ? 0.7 : 0.35;
  const steps = [];

  // Always include one core step
  steps.push(...pickN(actionsCore, 1));

  // Maybe add an advanced step if chance hits
  if (Math.random() < advChance) steps.push(...pickN(actionsAdv, 1));

  // Maybe one more core step to reach base
  if (steps.length < base) steps.push(...pickN(actionsCore, 1));

  // Cap at 3 steps
  return steps.slice(0, 3);
}

const quest = {
  title: "Vanilla Daily Quest",
  id: DATE,
  date: DATE,
  lore:
    "A simple, seed-agnostic challenge you can finish in survival without commands or mods.",
  biome_hint: biomeHints[Math.floor(Math.random() * biomeHints.length)],
  reward: rewards[Math.floor(Math.random() * rewards.length)],
  steps: stepsForDate(DATE),
  rules: [
    "Vanilla survival only. No commands, no mods, any seed.",
    "All steps are optional—play safely and have fun.",
    "If a structure-based step isn’t found in 10 minutes, you may skip it.",
  ],
};

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

ensureDir(OUT_DIR);
fs.writeFileSync(OUT, JSON.stringify(quest, null, 2));
console.log(`Wrote ${OUT}`);
