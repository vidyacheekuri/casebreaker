# CaseBreaker Next-Step Plan: 3 Daily Shared Mysteries with 24-Hour Dynamic Keywords

## Summary
CaseBreaker should move from one static handcrafted case to a **scheduled multi-agent pipeline that publishes 3 shared mystery slots per day**. For your final project and interviews, this is the strongest direction: it demonstrates story generation, multi-agent reasoning, consistency enforcement, asset pipelines, scheduling, caching, and cost-aware product design, while still being demo-safe.

**Where you stand now**
- The current repo already proves the **playable interrogation experience** in [`/Users/vidyacheekuri/Local_Storage/Casebreaker_AI/game`](\/Users/vidyacheekuri/Local_Storage/Casebreaker_AI/game): one hardcoded story, suspect chat via Claude, speech via ElevenLabs, and cached Tripo models.
- The missing piece is the real backend pipeline: **generate new stories, identify suspects, build agents, generate/store assets, publish daily slots, and feed the UI dynamically**.

**Product model locked in**
- Generate **3 mysteries together once per day at midnight**.
- Keep them stable for 24 hours.
- Generate **10–15 keyword chips from those 3 stories after generation**.
- Those keywords also refresh every 24 hours.
- Users pick up to 4 keywords, and the backend **routes them to the best-fit one of the 3 already-generated slots**.
- Keywords do **not** trigger on-demand generation.

## Implementation Changes
### 1. Backend architecture
- Add a **separate FastAPI backend** for orchestration and generation.
- Use **APScheduler** for the midnight batch job.
- Use **SQLite** for lightweight persistence of daily slots, story history, suspect metadata, asset status, and session records.
- Use **ChromaDB** for:
  - literary/style grounding from Project Gutenberg
  - optional world-state retrieval for suspect consistency during interrogation
- Store generated artifacts on disk: story JSON, suspect packs, Tripo `.glb` files, thumbnails if needed, and voice assignments.

### 2. Daily story-generation pipeline
- Build one midnight job that produces **exactly 3 publishable mystery packages** for the next 24 hours.
- Each package should include:
  - story/world state
  - 3 main suspects
  - per-suspect agent prompt/knowledge pack
  - saved 3D model path
  - assigned ElevenLabs voice ID
  - summary metadata for the UI
- Pipeline order:
  1. generate candidate mystery from seeded inputs
  2. run consistency validation
  3. identify/select the 3 main suspects
  4. build per-suspect interrogation agents
  5. request/generate Tripo models and save them
  6. assign best-fit voices from a fixed ElevenLabs voice bank
  7. publish the slot only when it is playable
- Add a **novelty guard** so stories are not effectively repeated:
  - store fingerprints using setting, killer pattern, motive family, suspect-role pattern, clue pattern, and summary embedding
  - reject near-duplicates and regenerate
- Use the milestone deck’s intended grounding:
  - **Project Gutenberg** for mystery tone, pacing, red-herring structure, and literary retrieval
  - **FBI crime data** for realistic motive/relationship patterns
  - **persona/archetype data** for suspect personality variety

### 3. Daily keyword system
- After the 3 stories are generated, extract a **shared pool of 10–15 keyword chips** for that day.
- Keywords should come from the actual generated stories, not from a fixed permanent list.
- Keyword examples: setting, motive, relationship dynamic, clue style, emotional tone, archetypes.
- The keyword pool remains stable for that day and **refreshes every 24 hours with the next batch of 3 stories**.
- User flow:
  - landing page shows today’s keyword chips
  - user selects up to 4
  - backend scores all 3 daily slots against those selections
  - backend routes the user to the best-fit published slot
- If the user skips keyword selection, they can still browse/select one of the 3 daily mysteries directly.

### 4. Asset and voice strategy
- Use a **curated internal ElevenLabs voice bank**, not fresh voice creation each day.
- Match voices to suspects by age band, gender presentation, temperament, class/era tone, and speaking style.
- Run Tripo generation **offline in the batch pipeline**, not during the session.
- Add fallbacks:
  - if Tripo fails after retries, assign a fallback avatar/model so the slot stays playable
  - if voice matching fails, assign a default archetype voice
- Track asset status per suspect so failed pieces can retry before publication.

### 5. Frontend/UI changes
- Keep the current interrogation-room style and overall visual direction.
- Replace the hardcoded single-case flow with:
  - a landing page showing **today’s 3 mystery slots**
  - a dynamic **daily keyword selection area**
  - a route into the selected/matched story
- Load all story data, suspects, models, and voice IDs from backend APIs instead of static constants.
- Preserve the current interrogation UI as the core experience once a slot is chosen.

### 6. Public interfaces
- Add backend endpoints for:
  - `POST /admin/generate-daily-slots` for manual/demo refresh
  - `GET /daily-slots` to return today’s 3 published mysteries plus daily keywords
  - `POST /daily-slots/match` to map selected keywords to a slot
  - `POST /sessions/start` to begin a session for a specific slot
  - `POST /sessions/{id}/interrogate` for suspect dialogue
  - `GET /sessions/{id}/state` for resume/load
- Daily slot response should explicitly include:
  - slot ID
  - publish date
  - title/summary
  - daily keywords
  - suspect list
  - model URLs
  - assigned voice IDs

## Test Plan
- Verify the midnight job produces **exactly 3 playable slots** and one shared keyword pool for the day.
- Verify the keyword pool is **derived from the 3 generated stories** and changes on the next day’s batch.
- Verify keyword selection always routes the user to one of the 3 already-published mysteries and never triggers new generation.
- Verify every published slot has exactly 3 suspects, complete prompts, assigned voices, and playable model references.
- Verify novelty protection rejects near-duplicate stories from prior days.
- Verify suspect responses stay consistent with generated world state across multiple questions.
- Verify a slot still publishes if one model or one voice assignment fails, using the fallback path.
- Verify the frontend can run a full session with generated data and no dependency on static `HARLOW_MANOR` content.

## Assumptions and Defaults
- This plan is optimized for a **final-project demo and interview portfolio**, not long-term commercial scale.
- The backend is a **new FastAPI service** and the current Next.js app remains the frontend.
- The system generates **3 daily stories in one midnight batch**, not on-demand.
- The daily keyword set is **generated from those 3 stories** and refreshes every 24 hours.
- Keywords are used for **matching/routing**, not custom story creation.
- ElevenLabs uses a **fixed curated voice bank**.
- Tripo generation happens **before publication**, never during user play.
- The next implementation milestone is **Pipeline MVP**: generate 3 daily slots, generate/store their assets, expose them through backend APIs, and load one generated slot into the existing interrogation UI.
