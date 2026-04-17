# CaseBreaker AI

An AI-driven mystery game where you interrogate suspects in real time. A multi-agent backend generates a fresh, self-consistent case daily; a conversational frontend lets you question characters whose memory, alibis, and emotional state are simulated by an LLM.

Right now the repo contains three parallel efforts:

1. **`casebreaker/`** — Python/FastAPI backend (world-gen, RAG, agent graph, scheduler).
2. **`casebreaker-frontend/`** — the original Vite/React interrogation UI.
3. **`character-preview/`** — a Next.js 16 prototype exploring 3D, voiced, lip-synced characters (Dr. Fenn).

---

## Vision

- Every day, a multi-agent pipeline (Architect → Characters → Consistency → Evaluator) produces a new mystery: victim, suspects, alibis, clues, and a hidden solution.
- The world is grounded in a literary corpus (Doyle, Christie, Poe, etc.) via ChromaDB RAG so tone and pacing stay coherent.
- The player interrogates suspects conversationally. Characters have partial knowledge, hidden motives, and emotional states that shift under pressure (stress gauge, evasion, contradictions).
- A scheduler ships one new case per day.
- The long-term goal is a fully voiced, animated 3D interrogation experience (3 agents × 3–4 characters per story).

---

## Current Status (Apr 2026)

### Working
- **Backend agent graph** (`casebreaker/backend/agents/`) — Architect, Character, Consistency, Evaluator modules scaffolded.
- **RAG layer** (`casebreaker/backend/rag/`) — Chroma client, literary and world embedders/retrievers.
- **API** (`casebreaker/backend/api/`) — FastAPI app with routes and a simple in-memory state store.
- **Daily scheduler** (`casebreaker/backend/scheduler/daily_job.py`) — APScheduler hook for daily case generation.
- **Conversation loop (3D prototype)** — Claude Haiku streams in-character responses for Dr. Fenn, with dynamic stress tracking and a polished, moody interrogation UI (typewriter text, stress gauge, suggested questions).
- **Voice** — ElevenLabs TTS with browser `speechSynthesis` as fallback. ElevenLabs `/with-timestamps` returns character timestamps + a viseme timeline.
- **3D scene (`character-preview/`)** — React Three Fiber canvas with atmospheric lighting, OrbitControls, procedural idle breathing / head sway / stress jitter. Anti-vanishing lifecycle bugs (bounding box, frustum culling, transform-out-of-state) are solved.
- **Tripo text-to-model pipeline** — Claude refines the character prompt, Tripo generates a GLB, and the result is cached at `character-preview/public/models/dr_fenn_tripo.glb` to avoid burning credits.

### Blocked: Realistic Lip-Sync
Extensively debugged in `dr_fenn_lipsync_debug_summary.txt`. Root cause is proven by runtime telemetry:

- The cached Tripo GLB is a **pure rigid mesh** — no morph targets, no skeleton, no jaw bone.
- Mixamo fallbacks (`brian.glb`, `Soldier.glb`) have skeletons (65 bones) but **no morph targets and no jaw bone**.
- The speech pipeline itself is healthy: ElevenLabs returns audio + ~200 viseme events + ~600 character timestamps per utterance, and the React speaking state flips correctly.
- A three-tier fallback is wired in `CharacterCanvas.tsx`: (a) morph targets → (b) jaw/head bone → (c) rigid-mesh pulse + body beat. Only (c) can currently fire.

**Fix path:** force-regenerate Tripo with `face_rig: true` + `workflow: "animation"` (already wired in `lib/tripoService.ts` with a progressive retry chain) and bust the cache. If Tripo still returns rigid geometry, swap to a pre-rigged humanoid base (Ready Player Me / ActorCore / ARKit-viseme asset) and keep Tripo only for style refs.

### Strategic Options (from `3D_PROTOTYPE_SUMMARY.md`)
- **A. Pivot to 2D portraits** — swap images on emotion. Cheap, infinitely scalable.
- **B. Keep 3D without real lip-sync** — body bob + closed mouth. Ships today.
- **C. Full 3D lip-sync pipeline** — viseme-ready models + AWS Polly / Rhubarb. AAA feel, high asset friction.

---

## Repository Layout

```
Casebreaker_AI/
├── casebreaker/                 # Python package (backend)
│   └── backend/
│       ├── agents/              # architect, character, consistency, evaluator
│       ├── api/                 # FastAPI app (main.py, routes.py, state_store.py)
│       ├── models/              # pydantic models (session, world)
│       ├── rag/                 # chroma client + literary/world embedders & retrievers
│       ├── scheduler/           # APScheduler daily job
│       ├── scripts/             # e.g. build_literary_corpus.py
│       └── utils/               # config, prompts
│
├── casebreaker-frontend/        # Vite + React 19 interrogation UI (original)
│
├── character-preview/           # Next.js 16 + R3F 3D prototype (Dr. Fenn)
│   ├── app/                     # App Router pages + API routes (/api/speak, /api/tripo-model)
│   ├── components/              # CharacterCanvas.tsx, Character.tsx
│   ├── lib/                     # tripoService.ts, character-pipeline.ts
│   ├── public/models/           # .glb characters (Soldier, brian, dr_fenn_tripo, …)
│   └── scripts/seed-dr-fenn-model.mjs
│
├── requirements.txt             # Python deps
├── Dockerfile                   # Backend container
├── docker-compose.yml           # Single-service backend deployment
├── run_backend.sh               # Local uvicorn runner
├── .env.example                 # Required env vars
├── 3D_PROTOTYPE_SUMMARY.md      # 3D eval + strategic options
└── dr_fenn_lipsync_debug_summary.txt   # Full lip-sync root-cause analysis
```

---

## Tech Stack

**Backend** — Python 3.11, FastAPI, Uvicorn, LangChain, LangGraph, ChromaDB, APScheduler, Pydantic 2.

**Frontends** — React 19 + Vite 7 (original UI); Next.js 16 + React 18 + TypeScript + Tailwind 4 (3D prototype).

**3D / Audio** — Three.js, `@react-three/fiber`, `@react-three/drei`, ElevenLabs, Anthropic Claude Haiku (prompt refinement + character dialogue), Tripo AI (text-to-model), AWS Polly (planned for visemes), Groq + Google Generative AI (available).

---

## Quickstart

### 1. Prerequisites
- Python 3.11+
- Node.js 20+
- An `.env` at the repo root (copy from `.env.example`)

```bash
cp .env.example .env
# fill in OPENAI_API_KEY (and, for character-preview, ANTHROPIC_API_KEY,
# ELEVENLABS_API_KEY, TRIPO_API_KEY as needed)
```

### 2. Backend (FastAPI)
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
./run_backend.sh
# → http://127.0.0.1:8000
```

Or via Docker:
```bash
docker compose up --build
```

### 3. Original frontend (Vite)
```bash
cd casebreaker-frontend
npm install
npm run dev
```

### 4. 3D prototype (Next.js)
```bash
cd character-preview
npm install
npm run dev
# → http://localhost:3000

# (Re)generate Dr. Fenn's Tripo model with the latest rig flags:
npm run seed:dr-fenn
```

---

## Environment Variables

Minimum (backend):
- `OPENAI_API_KEY`

Character preview (add as needed in `character-preview/.env.local`):
- `ANTHROPIC_API_KEY` — Claude Haiku character dialogue + prompt refinement
- `ELEVENLABS_API_KEY` — TTS + viseme timestamps
- `TRIPO_API_KEY` — text-to-3D character generation
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — (optional) Polly visemes
- `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY` — (optional) alt providers

---

## Roadmap

**Short-term**
- Unblock lip-sync: force a fresh Tripo generation with `face_rig=true` / `workflow="animation"` and confirm morph keys; if rigid, pivot to a pre-rigged humanoid base.
- Decide 2D vs 3D (Option A / B / C) for scaling characters per story.
- Remove `// #region agent log` debug instrumentation once lip-sync is verified end-to-end.

**Medium-term**
- Wire the Vite frontend to the FastAPI daily-case pipeline end-to-end (world → suspects → interrogation → accusation → verdict).
- Persist sessions (currently in-memory `state_store.py`).
- Automated character-rig validation before load (scaffolding exists in `character-preview/lib/character-pipeline.ts`).

**Long-term**
- Multi-character scenes (3 agents × 3–4 figures per story).
- Cross-character consistency enforcement via the Consistency agent.
- Case difficulty tuning via the Evaluator agent.
- Daily leaderboard / accusation scoring.

---

## Key References
- `3D_PROTOTYPE_SUMMARY.md` — honest eval of the 3D route and strategic options.
- `dr_fenn_lipsync_debug_summary.txt` — full hypothesis-driven debug log of the lip-sync blocker (H1–H9, N1, F1–F2).
- `CaseBreakerAI_Proposal.docx` — original product proposal.

---

## License
TBD — private prototype.
