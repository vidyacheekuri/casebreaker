import {
  DEFAULT_CHARACTER_SPEC,
  type CharacterAsset,
  type CharacterSpec,
  type StoryCharacterSession,
  makeStorySpec,
} from "@/lib/character-pipeline";
import { matchCuratedCharacter } from "@/lib/character-catalog";
import { validateModelRig } from "@/lib/rig-validator";

export const runtime = "nodejs";

type StoryCharacterRequest = {
  storyId?: string;
  sessionId?: string;
  spec?: Partial<CharacterSpec>;
};

async function tryGenerateCharacter(spec: CharacterSpec): Promise<CharacterAsset | null> {
  const generatorUrl = process.env.CHARACTER_GENERATOR_URL;
  if (!generatorUrl) return null;

  const res = await fetch(generatorUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.CHARACTER_GENERATOR_API_KEY
        ? { Authorization: `Bearer ${process.env.CHARACTER_GENERATOR_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({ spec }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { modelUrl?: string; name?: string; id?: string; tags?: string[] };
  if (!data.modelUrl) return null;

  return {
    id: data.id ?? `generated-${Date.now()}`,
    name: data.name ?? "Generated Character",
    modelUrl: data.modelUrl,
    source: "generated",
    tags: data.tags ?? ["human", "generated"],
  };
}

function mergeSpec(storyId: string, incoming?: Partial<CharacterSpec>): CharacterSpec {
  const base = makeStorySpec(storyId);
  if (!incoming) return base;
  return {
    ...base,
    ...incoming,
    storyId,
    styleTags: incoming.styleTags?.length ? incoming.styleTags : base.styleTags,
    ageRange: incoming.ageRange ?? base.ageRange,
    role: incoming.role ?? base.role,
    genderPresentation: incoming.genderPresentation ?? base.genderPresentation,
    era: incoming.era ?? base.era,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StoryCharacterRequest;
    const storyId = body.storyId ?? `story-${Date.now()}`;
    const sessionId = body.sessionId ?? crypto.randomUUID();
    const spec = mergeSpec(storyId, body.spec);

    const triedAssets: CharacterAsset[] = [];

    const curatedMatch = matchCuratedCharacter(spec);
    if (curatedMatch) triedAssets.push(curatedMatch);

    const generated = await tryGenerateCharacter(spec);
    if (generated) triedAssets.push(generated);

    if (!triedAssets.length) {
      return new Response(
        JSON.stringify({
          error:
            "No character candidates found. Add curated lip-ready characters or configure CHARACTER_GENERATOR_URL.",
        }),
        { status: 400 }
      );
    }

    for (const candidate of triedAssets) {
      const rigReport = await validateModelRig(candidate.modelUrl);
      if (rigReport.lipRig === "none") continue;

      const session: StoryCharacterSession = {
        storyId,
        sessionId,
        spec,
        asset: candidate,
        rigReport,
        createdAtIso: new Date().toISOString(),
      };

      return new Response(JSON.stringify(session), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        error: "No lip-capable character found for this story.",
        details: triedAssets.map((a) => ({ id: a.id, modelUrl: a.modelUrl })),
      }),
      { status: 422 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown story-character error";
    return new Response(JSON.stringify({ error: message, fallbackSpec: DEFAULT_CHARACTER_SPEC }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
