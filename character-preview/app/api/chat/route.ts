import Anthropic from "@anthropic-ai/sdk";
import { CHARACTER_SYSTEM_PROMPT } from "@/lib/character";

export const runtime = "nodejs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: Request) {
  try {
    const { message, history } = await req.json();

    const messages = [
      ...history.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

    const stream = anthropic.messages.stream({
      model: "claude-haiku-4-5-20251001",
      system: CHARACTER_SYSTEM_PROMPT,
      messages,
      max_tokens: 300,
      temperature: 0.8,
    });

    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              const text = event.delta.text;
              if (text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
              }
            }
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : "Stream error";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: `[Error: ${errMsg}]` })}\n\n`));
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
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: errMsg }), { status: 500 });
  }
}
