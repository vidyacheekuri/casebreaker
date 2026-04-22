import type {
  AccuseRequest,
  AccuseResponse,
  DailySlotsMatchRequest,
  DailySlotsMatchResponse,
  DailySlotsResponse,
  InterrogateRequest,
  InterrogateResponse,
  SessionStartRequest,
  SessionStartResponse,
  SessionStateResponse,
} from "@/lib/backend-types";

const PROXY_PREFIX = "/api/backend";

function normalizeErrorPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const maybeDetail = (payload as { detail?: unknown }).detail;
  if (typeof maybeDetail === "string" && maybeDetail.trim()) {
    return maybeDetail;
  }

  const maybeError = (payload as { error?: unknown }).error;
  if (typeof maybeError === "string" && maybeError.trim()) {
    return maybeError;
  }

  return null;
}

export class BackendApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BackendApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PROXY_PREFIX}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { detail: text };
    }
  }

  if (!response.ok) {
    const message = normalizeErrorPayload(parsed) ?? `Request failed (${response.status})`;
    throw new BackendApiError(response.status, message);
  }

  return parsed as T;
}

export function getDailySlots(): Promise<DailySlotsResponse> {
  return request<DailySlotsResponse>("/daily-slots", { method: "GET" });
}

export function matchDailySlot(payload: DailySlotsMatchRequest): Promise<DailySlotsMatchResponse> {
  return request<DailySlotsMatchResponse>("/daily-slots/match", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function startSession(payload: SessionStartRequest): Promise<SessionStartResponse> {
  return request<SessionStartResponse>("/sessions/start", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function interrogateSession(
  sessionId: string,
  payload: InterrogateRequest
): Promise<InterrogateResponse> {
  return request<InterrogateResponse>(`/sessions/${sessionId}/interrogate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSessionState(sessionId: string): Promise<SessionStateResponse> {
  return request<SessionStateResponse>(`/sessions/${sessionId}/state`, { method: "GET" });
}

export function accuseSession(sessionId: string, payload: AccuseRequest): Promise<AccuseResponse> {
  return request<AccuseResponse>(`/sessions/${sessionId}/accuse`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
