import { VOICE_ID } from "@/lib/character";
import {
  approxVisemeTimelineFromText,
  type CharacterTimestampRange,
  type VisemeTimeline,
} from "@/lib/character-pipeline";
import {
  PollyClient,
  SynthesizeSpeechCommand,
  type VoiceId,
} from "@aws-sdk/client-polly";

export const runtime = "nodejs";

type SpeakBody = {
  text: string;
};

type ElevenLabsAlignment = {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
};

function buildCharacterTimestampsFromText(text: string, durationMs: number): CharacterTimestampRange[] {
  const chars = Array.from(text);
  if (!chars.length) return [];
  const perChar = Math.max(20, durationMs / chars.length);
  return chars.map((char, index) => {
    const startMs = Math.round(index * perChar);
    const endMs = Math.round((index + 1) * perChar);
    return { char, startMs, endMs };
  });
}

function parseElevenLabsCharacterTimestamps(
  alignment: ElevenLabsAlignment | undefined
): CharacterTimestampRange[] {
  if (!alignment) return [];
  const chars = alignment.characters ?? [];
  const starts = alignment.character_start_times_seconds ?? [];
  const ends = alignment.character_end_times_seconds ?? [];
  const count = Math.min(chars.length, starts.length, ends.length);
  const ranges: CharacterTimestampRange[] = [];
  for (let i = 0; i < count; i += 1) {
    const startMs = Math.max(0, Math.round((starts[i] ?? 0) * 1000));
    const endMs = Math.max(startMs, Math.round((ends[i] ?? starts[i] ?? 0) * 1000));
    ranges.push({
      char: chars[i] ?? "",
      startMs,
      endMs,
    });
  }
  return ranges;
}

function parsePollySpeechMarks(raw: string, durationMs: number): VisemeTimeline {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const events = lines
    .map((line) => {
      try {
        return JSON.parse(line) as { time?: number; value?: string };
      } catch {
        return null;
      }
    })
    .filter((item): item is { time?: number; value?: string } => Boolean(item))
    .map((item) => ({
      timeMs: Math.max(0, item.time ?? 0),
      viseme: item.value ?? "aa",
      strength: 0.85,
    }));

  return {
    provider: "aws-polly",
    durationMs,
    events,
  };
}

async function synthesizeWithPolly(text: string): Promise<{
  audioBase64: string;
  visemeTimeline: VisemeTimeline;
  characterTimestamps: CharacterTimestampRange[];
} | null> {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) return null;

  const voiceId = (process.env.AWS_POLLY_VOICE_ID ?? "Amy") as VoiceId;
  const client = new PollyClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const audioRes = await client.send(
    new SynthesizeSpeechCommand({
      Engine: "neural",
      LanguageCode: "en-GB",
      VoiceId: voiceId,
      OutputFormat: "mp3",
      Text: text,
      TextType: "text",
    })
  );

  if (!audioRes.AudioStream) return null;
  const audioBytes = Buffer.from(await audioRes.AudioStream.transformToByteArray());

  const visemeRes = await client.send(
    new SynthesizeSpeechCommand({
      Engine: "neural",
      LanguageCode: "en-GB",
      VoiceId: voiceId,
      OutputFormat: "json",
      SpeechMarkTypes: ["viseme"],
      Text: text,
      TextType: "text",
    })
  );

  const durationMs = Math.max(1200, text.length * 55);
  const visemeRaw = visemeRes.AudioStream
    ? Buffer.from(await visemeRes.AudioStream.transformToByteArray()).toString("utf8")
    : "";
  const visemeTimeline = visemeRaw
    ? parsePollySpeechMarks(visemeRaw, durationMs)
    : approxVisemeTimelineFromText(text, "aws-polly-fallback");

  return {
    audioBase64: audioBytes.toString("base64"),
    visemeTimeline,
    characterTimestamps: buildCharacterTimestampsFromText(text, visemeTimeline.durationMs),
  };
}

export async function POST(req: Request) {
  try {
    const { text } = (await req.json()) as SpeakBody;
    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: "Text is required" }), { status: 400 });
    }

    const polly = await synthesizeWithPolly(text);
    if (polly) {
      return new Response(
        JSON.stringify({
          audio: polly.audioBase64,
          visemeTimeline: polly.visemeTimeline,
          characterTimestamps: polly.characterTimestamps,
          provider: "aws-polly",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY!,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.8,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("ElevenLabs error:", response.status, errorBody);
      return new Response(
        JSON.stringify({ error: `ElevenLabs ${response.status}: ${errorBody}` }),
        { status: response.status }
      );
    }

    const data = (await response.json()) as {
      audio_base64?: string;
      alignment?: ElevenLabsAlignment;
      normalized_alignment?: ElevenLabsAlignment;
    };
    if (!data.audio_base64) {
      throw new Error("ElevenLabs response missing audio_base64.");
    }
    const visemeTimeline = approxVisemeTimelineFromText(text, "elevenlabs-approx");
    const primaryCharacterTimestamps = parseElevenLabsCharacterTimestamps(data.alignment);
    const normalizedCharacterTimestamps = parseElevenLabsCharacterTimestamps(
      data.normalized_alignment
    );
    const fallbackCharacterTimestamps = buildCharacterTimestampsFromText(
      text,
      visemeTimeline.durationMs
    );

    return new Response(
      JSON.stringify({
        audio: data.audio_base64,
        visemeTimeline,
        characterTimestamps:
          primaryCharacterTimestamps.length > 0
            ? primaryCharacterTimestamps
            : normalizedCharacterTimestamps.length > 0
              ? normalizedCharacterTimestamps
              : fallbackCharacterTimestamps,
        provider: "elevenlabs",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    console.error("Speak error:", errMsg);
    return new Response(JSON.stringify({ error: errMsg }), { status: 500 });
  }
}
