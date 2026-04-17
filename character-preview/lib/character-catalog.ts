import type { CharacterAsset, CharacterSpec } from "@/lib/character-pipeline";

export const CURATED_CHARACTER_CATALOG: CharacterAsset[] = [
  {
    id: "brian",
    name: "Brian",
    modelUrl: "/models/brian.glb",
    source: "curated",
    tags: ["human", "male", "formal", "interrogation", "1920s"],
  },
  {
    id: "character",
    name: "Character",
    modelUrl: "/models/character.glb",
    source: "curated",
    tags: ["human", "male", "interrogation", "1920s"],
  },
];

function scoreAsset(spec: CharacterSpec, asset: CharacterAsset): number {
  let score = 0;
  for (const tag of spec.styleTags) {
    if (asset.tags.includes(tag)) score += 2;
  }
  if (spec.genderPresentation !== "unspecified") {
    if (asset.tags.includes(spec.genderPresentation)) score += 2;
  }
  if (asset.tags.includes(spec.era)) score += 1;
  if (asset.tags.includes("human")) score += 2;
  return score;
}

export function matchCuratedCharacter(spec: CharacterSpec): CharacterAsset | null {
  const ranked = CURATED_CHARACTER_CATALOG
    .map((asset) => ({ asset, score: scoreAsset(spec, asset) }))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length || ranked[0].score <= 0) return null;
  return ranked[0].asset;
}
