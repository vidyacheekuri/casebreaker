/**
 * CaseBreaker AI API client.
 * Base URL: VITE_API_URL or http://localhost:8000
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function getDailyCase() {
  const res = await fetch(`${API_BASE}/daily/case`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function startSession() {
  const res = await fetch(`${API_BASE}/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function interrogate(token, characterId, message) {
  const res = await fetch(`${API_BASE}/session/${token}/interrogate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ character_id: characterId, message }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function examine(token, evidenceId) {
  const res = await fetch(`${API_BASE}/session/${token}/examine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evidence_id: evidenceId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function accuse(token, characterId, reasoning) {
  const res = await fetch(`${API_BASE}/session/${token}/accuse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ character_id: characterId, reasoning }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getReplayCheck(token) {
  const res = await fetch(`${API_BASE}/session/${token}/replay`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function replay(token) {
  const res = await fetch(`${API_BASE}/session/${token}/replay`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getLeaderboard() {
  const res = await fetch(`${API_BASE}/leaderboard/today`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
