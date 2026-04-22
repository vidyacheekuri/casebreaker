export const runtime = "nodejs";

const DEFAULT_BACKEND_BASE = "http://127.0.0.1:8000";

function backendBaseUrl(): string {
  const configured =
    process.env.CASEBREAKER_BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    DEFAULT_BACKEND_BASE;
  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

interface InterrogateProxyRequest {
  sessionId: string;
  characterId: string;
  message: string;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const payload = (await req.json()) as InterrogateProxyRequest;
    if (!payload.sessionId || !payload.characterId || !payload.message?.trim()) {
      return Response.json(
        { error: "sessionId, characterId, and message are required" },
        { status: 400 }
      );
    }

    const upstream = await fetch(`${backendBaseUrl()}/sessions/${payload.sessionId}/interrogate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        character_id: payload.characterId,
        message: payload.message,
      }),
      cache: "no-store",
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
