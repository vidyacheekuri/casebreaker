export const runtime = "nodejs";

const DEFAULT_BACKEND_BASE = "http://127.0.0.1:8000";

function backendBaseUrl(): string {
  const configured =
    process.env.CASEBREAKER_BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    DEFAULT_BACKEND_BASE;
  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function forward(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { path } = await context.params;

    if (!path || path.length === 0) {
      return Response.json({ detail: "Not Found" }, { status: 404 });
    }

    const incomingUrl = new URL(request.url);
    const targetUrl = `${backendBaseUrl()}/${path.join("/")}${incomingUrl.search}`;

    const outgoingHeaders = new Headers();
    request.headers.forEach((value, key) => {
      const normalized = key.toLowerCase();
      if (normalized === "host" || normalized === "content-length" || normalized === "connection") {
        return;
      }
      outgoingHeaders.set(key, value);
    });

    const hasBody = request.method !== "GET" && request.method !== "HEAD";

    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: outgoingHeaders,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
    });

    const responseHeaders = new Headers();
    const passthroughHeaders = ["content-type", "cache-control", "pragma", "expires"];
    passthroughHeaders.forEach((header) => {
      const value = upstream.headers.get(header);
      if (value) {
        responseHeaders.set(header, value);
      }
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return Response.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Failed to reach backend service.",
      },
      { status: 502 }
    );
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context);
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context);
}
