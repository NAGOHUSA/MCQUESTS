const fs = require('fs');
const { HfInference } = require('@huggingface/inference');

const hf = new HfInference('YOUR_HF_TOKEN'); // Free tier: 1k calls/month

async function generateQuest() {
  const prompt = `
  Generate ONE epic Minecraft vanilla quest for today. Include:
  - Title (fun, mysterious)
  - Objective (1-3 steps, no mods)
  - Lore (2-3 sentences)
  - Reward idea
  - Biome hint
  - Seed-compatible (works in any world)
  Example: "The Whispering Acacia" → Find a lone acacia in savanna, dig under for buried map...
  `;

  const response = await hf.textGeneration({
    model: 'meta-llama/Llama-3.2-3B-Instruct',
    inputs: prompt,
    parameters: { max_new_tokens: 150 }
  });

  const quest = {
    date: new Date().toISOString().split('T')[0],
    title: extractTitle(response.generated_text),
    ...parseQuest(response.generated_text)
  };

  fs.writeFileSync(`quests/${quest.date}.json`, JSON.stringify(quest, null, 2));
}
