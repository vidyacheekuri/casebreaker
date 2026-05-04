# CaseBreaker Frontend Analysis

## Architecture Overview

**Tech Stack:**
- Framework: Next.js (TypeScript)
- State Management: Zustand
- Animation: Framer Motion
- Styling: Tailwind CSS
- 3D Models: Three.js (character models in /public/models)

**Project Structure:**
```
game/
├── app/                           # Next.js app directory
│   ├── api/                       # API routes
│   │   ├── interrogate/route.ts  # Interrogation proxy
│   │   ├── speak/route.ts        # Speech synthesis proxy
│   │   ├── backend/[...path]/    # General backend proxy
│   │   └── evidence/             # Evidence image generation
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Main game page
├── components/
│   ├── screens/                  # Full-screen game states
│   │   ├── InterrogationRoom.tsx # Main interrogation UI
│   │   └── interrogation/        # Interrogation subcomponents
│   │       ├── AvatarPanel.tsx
│   │       ├── ConversationPanel.tsx
│   │       ├── ControlPanel.tsx
│   │       ├── interrogation-utils.ts
│   │       └── speech-utils.ts
│   └── ui/                       # Reusable UI components
├── lib/
│   ├── store.ts                 # Zustand game state store
│   ├── backend-client.ts        # API client
│   ├── backend-types.ts         # Type definitions
│   └── character/               # Character generation pipeline
├── public/
│   └── models/                  # .glb 3D character models
└── next.config.ts              # Next.js config
```

---

## Interrogation Flow Analysis

### 1. Request Flow

**User → Frontend → Backend → LLM:**

```
InterrogationRoom.tsx (sendMessage)
    ↓
    interrogateSession(sessionId, {
        character_id: selectedSuspectId,
        message: `${userText}${buildEvidenceContext()}`
    })
    ↓
backend-client.ts (interrogateSession)
    ↓
fetch("/api/backend/sessions/{id}/interrogate", POST)
    ↓
app/api/interrogate/route.ts (proxy)
    ↓
fetch("http://127.0.0.1:8000/sessions/{id}/interrogate", POST)
    ↓
Backend Python (agents/character.py → LLM)
    ↓
Response back through chain
```

### 2. Key Components

#### InterrogationRoom.tsx (Main Container)
- **Line 144-203**: sendMessage() function
  - Gets user input from controlled input state (line 148)
  - Builds evidence context via buildEvidenceContext() (line 160)
  - **Creates message with**: `${text}${buildEvidenceContext(...)}`
  - Calls interrogateSession() with character_id and message
  - Handles response: displays reply, updates stress, updates history

**Code snippet (line 158-173):**
```typescript
const response = await interrogateSession(sessionId, {
  character_id: selectedSuspectId,
  message: `${text}${buildEvidenceContext(selectedEvidence, contradictoryEvidence)}`,
});
const stressDelta = stressImpactFromTone(response.tone);
increaseStress(selectedSuspectId, stressDelta);
setStreamKey((k) => k + 1);
await revealByWords(response.reply, setDisplayText);  // UI animation only
addMessages(selectedSuspectId, [
  {
    role: "assistant",
    content: response.reply,
    tone: response.tone,
    stressDelta,
  },
]);
```

#### API Route: app/api/interrogate/route.ts
- **Validates request**: sessionId, characterId, message required (line 22)
- **Proxies to backend**: Converts frontend camelCase to snake_case
  - `characterId` → `character_id` (line 33)
- **Disables caching**: `cache: "no-store"` (line 36)
- **Returns response**: Passes through backend response as-is

**Code snippet (line 29-37):**
```typescript
const upstream = await fetch(`${backendBaseUrl()}/sessions/${payload.sessionId}/interrogate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    character_id: payload.characterId,
    message: payload.message,
  }),
  cache: "no-store",
});
```

#### buildEvidenceContext() Function
**File**: components/screens/interrogation/interrogation-utils.ts (lines 108-122)

```typescript
export function buildEvidenceContext(selectedEvidence: EvidenceDto[], contradictoryEvidence: EvidenceDto[]): string {
  if (contradictoryEvidence.length > 0) {
    return `\n\n[Detective note: The player has selected evidence that points at this suspect: ${contradictoryEvidence
      .map((item) => item.name)
      .join(", ")}. Let the pressure show...]`;
  }
  if (selectedEvidence.length > 0) {
    return `\n\n[Detective note: The player has selected evidence: ${selectedEvidence
      .map((item) => item.name)
      .join(", ")}. Acknowledge relevant...]`;
  }
  return "";
}
```

**Behavior:**
- Returns different context based on selected evidence
- Evidence context is appended to the user's message
- If NO evidence selected: returns empty string ""
- Can vary between questions if evidence selection changes

#### ConversationPanel.tsx
- Maps over messages array (line 35)
- Uses key: `${message.timestamp ?? index}-${index}`
- Displays both history messages and active streaming message
- No message deduplication or caching

#### State Management (store.ts)
**addMessages() function (lines 567-578):**
```typescript
addMessages: (characterId, msgs) => {
  const timestampedMessages = msgs.map((message) => ({
    ...message,
    timestamp: message.timestamp ?? new Date().toISOString(),
  }));
  set((state) => ({
    interrogationHistories: {
      ...state.interrogationHistories,
      [characterId]: [...(state.interrogationHistories[characterId] ?? []), ...timestampedMessages],
    },
  }));
},
```

- Appends messages to interrogationHistories[characterId]
- Creates timestamps for new messages
- No deduplication
- History grows monotonically

---

## Potential Issues Identified

### Issue 1: Message Text Not Trimmed Before Evidence Context
**Location**: InterrogationRoom.tsx, line 160
**Current Code**:
```typescript
message: `${text}${buildEvidenceContext(selectedEvidence, contradictoryEvidence)}`
```
**Issue**: If `text` is not trimmed, double spaces could occur before evidence context
**Impact**: Minor, shouldn't affect response variation

### Issue 2: Evidence Context Appended to Message
**Location**: InterrogationRoom.tsx, line 160
**Current Code**: Message includes both user question AND detective instructions
**Potential Issue**: The LLM is receiving:
- User question text
- PLUS appended evidence context instructions
- Evidence context varies based on selected evidence

**This means**:
- If evidence selection is the SAME across multiple questions, the evidence context is identical
- If evidence selection changes, the evidence context changes
- But different QUESTIONS with SAME evidence = different user text but same evidence context

### Issue 3: Message Input Cleared Before Sending
**Location**: InterrogationRoom.tsx, line 153
```typescript
setInput("");  // Cleared BEFORE sending, not after response
```
**Current behavior**: Input is cleared immediately after taking text, before await interrogateSession()

### Issue 4: StreamKey Reset on Each Message
**Location**: InterrogationRoom.tsx, line 164
```typescript
setStreamKey((k) => k + 1);
```
**Purpose**: Forces StreamingMessageBubble to re-render
**Potential Issue**: If key is used for message deduplication logic somewhere else, this could cause problems

---

## Data Flow Verification

### What Should Happen (Healthy System)

**First question**: "Where were you?"
```
1. User types: "Where were you?"
2. Input trimmed: "Where were you?"
3. Evidence context: "" (no evidence selected) or "[Detective note: ...]"
4. Final message: "Where were you?[Detective note...]" or just "Where were you?"
5. Frontend sends to backend
6. Backend sends to LLM with different message each time
7. LLM returns DIFFERENT response for different questions
```

**Second question**: "What do you know about the glove?"
```
1. User types: "What do you know about the glove?"
2. Input trimmed: "What do you know about the glove?"
3. Evidence context: SAME or DIFFERENT depending on evidence selection
4. Final message: Different from first question (different user text)
5. Frontend sends to backend
6. Backend sends to LLM with different message than first question
7. LLM returns DIFFERENT response
```

### What Would Cause Identical Responses

**Scenario A: Same message being sent repeatedly**
- Would require input state to not update
- Would require evidence context to not update
- Code review shows this shouldn't happen

**Scenario B: Response being cached at HTTP level**
- Frontend has `cache: "no-store"` ✓
- Backend interrogate route should have no caching
- LLM calls should be stateless

**Scenario C: LLM receiving same prompt despite different messages**
- Would require message field to be empty or ignored
- Would require evidence context to be identical and dominant
- Unlikely unless LLM provider has request deduplication

**Scenario D: Response being reused in UI**
- ConversationPanel maps over messages (no reuse)
- StreamingMessageBubble gets fresh activeMessage each time
- revealByWords() animates the response word-by-word (shouldn't affect content)

---

## Frontend Code Quality Assessment

### Strengths ✅
1. **Proper cache control**: `cache: "no-store"` on all API calls
2. **Type safety**: Full TypeScript, typed API responses with Zod validation
3. **State immutability**: Zustand handles state immutability correctly
4. **Message tracking**: Messages stored with timestamps
5. **Evidence context**: Dynamic context based on player selections
6. **No obvious caching**: Frontend doesn't cache responses

### Concerns ⚠️
1. **Message concatenation**: Evidence context appended to message text (mixing game logic with user input)
2. **BuildEvidenceContext logic**: Could be clearer when context is/isn't included
3. **StreamKey pattern**: Resetting streamKey for each message is unusual (mostly works)
4. **No request deduplication**: Same question asked twice would send twice (correct behavior)
5. **No input validation**: Message is only checked for `trim()` length, not content

### Areas for Investigation 🔍
1. **Backend integration**: How exactly is the message being used in the LLM call?
2. **Message format**: Are there any hidden characters or formatting in the message?
3. **API proxy behavior**: Is the proxy correctly forwarding the request unchanged?
4. **Response parsing**: Is the response being parsed/transformed somewhere?

---

## Debug Checklist

### To Find the Bug, Check:

1. **In Browser DevTools Network tab:**
   - [ ] Are POST bodies to `/api/interrogate` different for different questions?
   - [ ] Are responses (`reply` field) identical despite different request bodies?
   - [ ] Are requests being made at all or cached?

2. **In Browser DevTools Console:**
   - [ ] Are messages being added to interrogationHistories correctly?
   - [ ] What does the messages array show after each question?

3. **In Browser LocalStorage:**
   - [ ] Check: `getGameStore.getState().interrogationHistories`
   - [ ] Are messages accumulating correctly?
   - [ ] Are they all identical or varied?

4. **In Backend logs (with diagnostic logging enabled):**
   - [ ] Is the message field different for each request?
   - [ ] Is the LLM receiving different prompts?
   - [ ] Is the LLM returning identical responses?

---

## Frontend Files Summary

| File | Purpose | Lines | Status |
|------|---------|-------|--------|
| InterrogationRoom.tsx | Main interrogation UI | 302 | ✓ Reviewed |
| app/api/interrogate/route.ts | API proxy | 55 | ✓ Reviewed |
| ConversationPanel.tsx | Message display | 73 | ✓ Reviewed |
| interrogation-utils.ts | Helper functions | 138 | ✓ Reviewed |
| backend-client.ts | API client | 202 | ✓ Reviewed |
| store.ts | State management | 664 | ✓ Reviewed (key sections) |

---

## Recommendation

The **frontend code appears correct**. The issue is likely:

1. **In the backend** (message not being used properly in LLM call)
2. **In the LLM request/response** (caching or deduplication at API level)
3. **In message formatting** (hidden characters or encoding issues)

The diagnostic logging added to `character.py` and `llm_provider.py` should help identify which layer is failing.

**Next Step**: Run a test interrogation and check the logs to see:
- Are different messages reaching the LLM?
- Is the LLM returning identical responses for different inputs?
- Where exactly is the response duplication happening?
