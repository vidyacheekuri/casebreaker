import { readFileSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const IMAGE_PIPELINE_VERSION = "2.0";

type CacheEntry = {
  imageUrl: string;
  prompt: string;
  model: string;
  generatedAt: number;
  /** Set for all entries in this route; v2 pipeline skips regeneration when present. */
  version: string;
};

const responseCache = new Map<string, CacheEntry>();

function entryVersion(entry: CacheEntry): string {
  return entry.version ?? IMAGE_PIPELINE_VERSION;
}

function readEnvFileValue(filePath: string, key: string): string | undefined {
  try {
    const envText = readFileSync(filePath, "utf-8");
    const line = envText
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith(`${key}=`));

    if (!line) {
      return undefined;
    }

    return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
  } catch {
    return undefined;
  }
}

function readLocalEnvValue(key: string): string | undefined {
  const cwd = process.cwd();
  const envPaths = [
    path.join(cwd, ".env.local"),
    path.join(cwd, "..", ".env"),
    path.join(cwd, "..", ".env.local"),
    path.join(cwd, "..", "backend", ".env"),
  ];

  for (const envPath of envPaths) {
    const value = readEnvFileValue(envPath, key);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function getServerEnvValue(key: string): string | undefined {
  return process.env[key]?.trim() || readLocalEnvValue(key);
}

/** Resolve cached v2 image without starting generation. */
export async function GET(request: NextRequest) {
  const caseId = request.nextUrl.searchParams.get("caseId")?.trim();
  const evidenceId = request.nextUrl.searchParams.get("evidenceId")?.trim();

  if (!caseId || !evidenceId) {
    return NextResponse.json({ error: "caseId and evidenceId are required" }, { status: 400 });
  }

  const cacheKey = `${caseId}:${evidenceId}`;
  const cached = responseCache.get(cacheKey);
  if (!cached) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const version = entryVersion(cached);
  if (version !== IMAGE_PIPELINE_VERSION) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    url: cached.imageUrl,
    version,
    model: cached.model,
  });
}

export async function POST(request: NextRequest) {
  try {
    const { caseId, evidenceId, prompt } = (await request.json()) as {
      caseId?: string;
      evidenceId?: string;
      prompt?: string;
    };

    if (!caseId || !evidenceId || !prompt?.trim()) {
      return NextResponse.json(
        { error: "caseId, evidenceId, and prompt are required" },
        { status: 400 }
      );
    }

    const cacheKey = `${caseId}:${evidenceId}`;
    const cached = responseCache.get(cacheKey);
    if (cached && entryVersion(cached) === IMAGE_PIPELINE_VERSION) {
      console.log("[evidence-images/api] cache hit (v2)", { caseId, evidenceId });
      return NextResponse.json({
        imageUrl: cached.imageUrl,
        provider: "openai",
        model: cached.model,
        cached: true,
        version: IMAGE_PIPELINE_VERSION,
      });
    }

    const apiKey = getServerEnvValue("OPENAI_API_KEY");
    if (!apiKey) {
      console.warn("[evidence-images/api] OPENAI_API_KEY missing", { caseId, evidenceId });
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 503 }
      );
    }

    const model =
      getServerEnvValue("OPENAI_EVIDENCE_IMAGE_MODEL") ||
      getServerEnvValue("OPENAI_IMAGE_MODEL") ||
      "gpt-image-1";
    console.log("[evidence-images/api] generating", {
      caseId,
      evidenceId,
      model,
    });

    const providerResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        size: "1024x1024",
        quality: "low",
        output_format: "jpeg",
        output_compression: 60,
        background: "opaque",
        moderation: "auto",
        user: `${caseId}:${evidenceId}`,
      }),
    });

    const result = (await providerResponse.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      error?: { message?: string };
    };

    if (!providerResponse.ok) {
      return NextResponse.json(
        {
          error:
            result.error?.message ||
            `OpenAI image request failed (${providerResponse.status})`,
        },
        { status: providerResponse.status }
      );
    }

    const image = result.data?.[0];
    const imageUrl = image?.b64_json
      ? `data:image/jpeg;base64,${image.b64_json}`
      : image?.url;

    if (!imageUrl) {
      console.error("[evidence-images/api] no image in response", { caseId, evidenceId });
      return NextResponse.json(
        { error: "Image provider returned no image data" },
        { status: 502 }
      );
    }

    responseCache.set(cacheKey, {
      imageUrl,
      prompt,
      model,
      generatedAt: Date.now(),
      version: IMAGE_PIPELINE_VERSION,
    });

    console.log("[evidence-images/api] generated", {
      caseId,
      evidenceId,
      cached: false,
    });

    return NextResponse.json({
      imageUrl,
      provider: "openai",
      model,
      cached: false,
      version: IMAGE_PIPELINE_VERSION,
    });
  } catch (error) {
    console.error("[evidence-images/api] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
