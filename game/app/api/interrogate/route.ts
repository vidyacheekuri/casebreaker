import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/suspects";
import type { SuspectId, EvidenceId } from "@/lib/cases/harlow-manor";

export const runtime = "nodejs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const STRESS_KEYWORDS: Record<SuspectId, string[]> = {
  fenn: ["strychnine", "victoria", "bag", "vial", "guest wing", "love", "lying", "corridor", "missing"],
  victoria: ["will", "amended", "charity", "gloves", "greenhouse", "diary", "strychnine", "guest wing", "corridor", "garden", "poison"],
  oliver: ["gambling", "debt", "inheritance", "argue", "argument", "library", "money", "fight", "quarrel"],
};

function calcStressImpact(suspectId: SuspectId, question: string): number {
  const lower = question.toLowerCase();
  const keywords = STRESS_KEYWORDS[suspectId] ?? [];
  const hits = keywords.filter((k) => lower.includes(k)).length;
  return Math.min(25, hits * 8);
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      suspectId: SuspectId;
      question: string;
      history: { role: "user" | "assistant"; content: string }[];
      discoveredEvidence: EvidenceId[];
      stressLevel: number;
    };

    const { suspectId, question, history, discoveredEvidence, stressLevel } = body;

    if (!suspectId || !question) {
      return new Response(JSON.stringify({ error: "suspectId and question are required" }), { status: 400 });
    }

    const systemPrompt = buildSystemPrompt(suspectId, discoveredEvidence, stressLevel);
    const stressImpact = calcStressImpact(suspectId, question);

    const messages = [
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: question },
    ];

    const stream = anthropic.messages.stream({
      model: "claude-haiku-4-5-20251001",
      system: systemPrompt,
      messages,
      max_tokens: 250,
      temperature: 0.85,
    });

    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          // Send stress impact metadata first
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "meta", stressImpact })}\n\n`)
          );

          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta" &&
              event.delta.text
            ) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "token", text: event.delta.text })}\n\n`)
              );
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Stream error";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", text: `[${msg}]` })}\n\n`)
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
