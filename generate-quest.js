#!/usr/bin/env node
/**
 * Minecraft Daily Quest generator (ESM)
 * Writes: quests/YYYY-MM-DD.json and updates quests/index.json
 * Timezone: America/New_York
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
const BASE_THEMES = [/* — same theme objects as before — */];
const HOLIDAY_THEMES = [/* — same holiday objects as before — */];

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
  const dt = toUTCDate(dateStr);
  const y = dt.getUTCFullYear();
  const start = new Date(Date.UTC(y, win.from.month - 1, win.from.day, 0, 0, 0));
  const end   = new Date(Date.UTC(y, win.to.month - 1, win.to.day, 23, 59, 59));
  return dt >= start && dt <= end;
}
function chooseThemeForDate(dateStr, rng) {
  const holiday = HOLIDAY_THEMES.find(win => dateInWindow(dateStr, win));
  if (holiday) return holiday;
  const idx = Math.floor(rng() * BASE_THEMES.length);
  return BASE_THEMES[idx];
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
  const theme = chooseThemeForDate(date, rng);
  const steps = stepsForDay(theme, dow, rng);
  const quest = {
    title: "Vanilla Daily Quest",
    theme: theme.key,
    color: theme.color || "#5c7cfa",
    id: date,
    date,
    lore: theme.lore,
    biome_hint: (theme.biomeHints || ["Any"])[Math.floor(rng() * (theme.biomeHints || ["Any"]).length)] || "Any",
    reward: (theme.rewards || ["Bragging Rights"])[Math.floor(rng() * (theme.rewards || ["Bragging Rights"]).length)],
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
