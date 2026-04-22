import { readFileSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const responseCache = new Map<
  string,
  {
    imageUrl: string;
    prompt: string;
    model: string;
    generatedAt: number;
  }
>();

function readBackendEnvValue(key: string): string | undefined {
  try {
    const envPath = path.join(process.cwd(), "..", "backend", ".env");
    const envText = readFileSync(envPath, "utf-8");
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

function getServerEnvValue(key: string): string | undefined {
  return process.env[key]?.trim() || readBackendEnvValue(key);
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
    if (cached) {
      console.log("[evidence-images/api] cache hit", { caseId, evidenceId });
      return NextResponse.json({
        imageUrl: cached.imageUrl,
        provider: "openai",
        model: cached.model,
        cached: true,
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
    });
  } catch (error) {
    console.error("[evidence-images/api] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
