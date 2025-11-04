/**
 * generate-quest.js
 * Auto-generates ONE epic vanilla Minecraft quest per day
 * Runs via GitHub Actions at midnight UTC
 * Uses Groq + Llama 3.1 8B for fast, structured output
 * Saves to: quests/2025-11-04.json
 */

const fs = require('fs');
const path = require('path');
const { groq } = require('@ai-sdk/groq');
const { generateObject } = require('ai');
const { z } = require('zod');

// === CONFIG ===
const REPO = 'NAGOHUSA/MCQUESTS'; // Your repo
const QUESTS_DIR = 'quests';      // Folder to save JSONs
const MODEL = 'llama-3.1-8b-instant'; // Fast & free tier

// === MAIN FUNCTION ===
async function generateQuest() {
  // Get today's date in YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];
  const outputPath = path.join(QUESTS_DIR, `${today}.json`);

  // Ensure quests directory exists
  if (!fs.existsSync(QUESTS_DIR)) {
    fs.mkdirSync(QUESTS_DIR, { recursive: true });
    console.log(`Created directory: ${QUESTS_DIR}`);
  }

  // Skip if quest already exists (prevents duplicates on manual runs)
  if (fs.existsSync(outputPath)) {
    console.log(`Quest already exists: ${outputPath}`);
    return;
  }

  try {
    console.log(`Generating quest for ${today}...`);

    // Call Groq with structured output (Zod schema)
    const { object } = await generateObject({
      model: groq(MODEL),
      schema: z.object({
        title: z.string().min(5).max(60).describe('Short, mysterious, fun title'),
        lore: z.string().min(30).max(180).describe('2-3 sentences of immersive backstory'),
        steps: z.array(z.string().min(10).max(140))
          .min(1).max(3)
          .describe('1-3 clear, vanilla Minecraft steps. No mods, no redstone.'),
        reward: z.string().min(10).max(100).describe('Creative, craftable/findable reward'),
        biomeHint: z.string().min(5).max(50).describe('Suggested starting biome or dimension'),
      }),
      prompt: `
You are a Minecraft lore master. Generate ONE epic, vanilla-friendly daily quest for ${today}.

Rules:
- 100% vanilla Minecraft (Java/Bedrock)
- Works in any world seed
- Focus: exploration, light survival, puzzles
- No mods, no commands, no impossible tasks
- Theme: mystery, artifact, echo, curse, whisper, forge

Output structured JSON only. Example:
{
  "title": "The Whispering Acacia",
  "lore": "In savanna winds, a lone tree hums with ancient songs...",
  "steps": ["Find acacia at sunset", "Dig beneath for buried map"],
  "reward": "Enchanted golden apple blueprint",
  "biomeHint": "Savanna"
}
      `.trim(),
      temperature: 0.8,
      max_tokens: 300,
    });

    // Build final quest object
    const quest = {
      date: today,
      id: today.replace(/-/g, ''), // e.g., 20251104
      title: object.title.trim(),
      lore: object.lore.trim(),
      steps: object.steps.map(s => s.trim()),
      reward: object.reward.trim(),
      biomeHint: object.biomeHint.trim(),
    };

    // Save to file
    fs.writeFileSync(outputPath, JSON.stringify(quest, null, 2));
    console.log(`Quest saved: ${outputPath}`);
    console.log(`Title: ${quest.title}`);

  } catch (error) {
    console.error('Failed to generate quest:', error.message);
    process.exit(1); // Fail the Action if API error
  }
}

// === RUN ===
generateQuest().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
