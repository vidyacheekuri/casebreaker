import {
  PollyClient,
  SynthesizeSpeechCommand,
  type VoiceId,
} from "@aws-sdk/client-polly";

export const runtime = "nodejs";

const FALLBACK_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // Dr. Fenn / Adam

export interface CharacterTimestamp {
  char: string;
  startMs: number;
  endMs: number;
}

type ElevenLabsAlignment = {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
};

function parseElevenLabsTimestamps(alignment: ElevenLabsAlignment | undefined): CharacterTimestamp[] {
  if (!alignment) return [];
  const chars = alignment.characters ?? [];
  const starts = alignment.character_start_times_seconds ?? [];
  const ends = alignment.character_end_times_seconds ?? [];
  const count = Math.min(chars.length, starts.length, ends.length);
  return Array.from({ length: count }, (_, i) => ({
    char: chars[i] ?? "",
    startMs: Math.max(0, Math.round((starts[i] ?? 0) * 1000)),
    endMs: Math.max(0, Math.round((ends[i] ?? starts[i] ?? 0) * 1000)),
  }));
}

function buildFallbackTimestamps(text: string, durationMs: number): CharacterTimestamp[] {
  const chars = Array.from(text);
  if (!chars.length) return [];
  const perChar = Math.max(20, durationMs / chars.length);
  return chars.map((char, i) => ({
    char,
    startMs: Math.round(i * perChar),
    endMs: Math.round((i + 1) * perChar),
  }));
}

async function elevenlabs(text: string, voiceId: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2 },
        }),
      }
    );
    if (!res.ok) { console.warn("ElevenLabs", res.status); return null; }
    const data = await res.json() as { audio_base64?: string; alignment?: ElevenLabsAlignment; normalized_alignment?: ElevenLabsAlignment };
    if (!data.audio_base64) return null;
    const ts = parseElevenLabsTimestamps(data.alignment ?? data.normalized_alignment);
    return {
      audio: data.audio_base64,
      characterTimestamps: ts.length > 0 ? ts : buildFallbackTimestamps(text, text.length * 80),
      provider: "elevenlabs",
    };
  } catch (e) { console.warn("ElevenLabs error:", e); return null; }
}

async function polly(text: string) {
  const { AWS_REGION: region, AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey } = process.env;
  if (!region || !accessKeyId || !secretAccessKey) return null;
  try {
    const voiceId = (process.env.AWS_POLLY_VOICE_ID ?? "Amy") as VoiceId;
    const client = new PollyClient({ region, credentials: { accessKeyId, secretAccessKey } });
    const audioRes = await client.send(new SynthesizeSpeechCommand({
      Engine: "neural", LanguageCode: "en-GB", VoiceId: voiceId,
      OutputFormat: "mp3", Text: text, TextType: "text",
    }));
    if (!audioRes.AudioStream) return null;
    const bytes = Buffer.from(await audioRes.AudioStream.transformToByteArray());
    return {
      audio: bytes.toString("base64"),
      characterTimestamps: buildFallbackTimestamps(text, text.length * 80),
      provider: "aws-polly",
    };
  } catch (e) { console.warn("Polly error:", e); return null; }
}

export async function POST(req: Request) {
  try {
    const { text, voiceId = FALLBACK_VOICE_ID } = await req.json() as { text: string; voiceId?: string };
    if (!text?.trim()) return new Response(JSON.stringify({ error: "text required" }), { status: 400 });

    const result = (await elevenlabs(text, voiceId)) ?? (await polly(text));
    if (!result) return new Response(JSON.stringify({ error: "All TTS providers unavailable" }), { status: 503 });

    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), { status: 500 });
  }
}
