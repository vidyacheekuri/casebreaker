# Master Interrogation Bug Diagnosis Guide

## Executive Summary

**Bug**: Suspects are giving identical responses to different detective questions during interrogation.

**Status**: Diagnostic infrastructure has been added. The issue is NOT in the frontend—the UI correctly passes different messages to the backend.

**Next Action**: Run test and check backend logs to identify which layer is failing.

---

## What's Been Done

### 1. Frontend Analysis (FRONTEND_ANALYSIS.md)
✅ **Complete code review** of:
- InterrogationRoom.tsx (main UI)
- app/api/interrogate/route.ts (proxy)
- backend-client.ts (API client)
- ConversationPanel.tsx (message display)
- store.ts (state management)

**Conclusion**: Frontend is correct. Messages are properly constructed and sent with `cache: "no-store"`.

### 2. Backend Diagnostic Logging (Added to Python files)

**Modified Files:**
- `backend/agents/character.py` - Logs message content and response
- `backend/agents/llm_provider.py` - Logs LLM calls and responses

**Logging Points:**
1. interrogate_suspect() - Entry with message hash
2. _format_history() - History content and length
3. _call_llm() - User prompt before LLM call
4. generate_json() - Raw LLM response
5. _generate_anthropic() - API call and response

### 3. Test Procedures (TEST_INTERROGATION_BUG.md)
✅ **Complete test procedure** with:
- Server startup commands
- curl commands to test interrogation
- Log analysis patterns
- What different outputs mean

---

## The Three Possible Failure Points

```
Frontend                Backend                    LLM
  ✓OK                     ?                        ?
                                                    
User Q1 ──────────→ Message 1 ──────────→ Prompt 1 ──────→ Response A?
User Q2 ──────────→ Message 2 ──────────→ Prompt 2 ──────→ Response B? or A?
User Q3 ──────────→ Message 3 ──────────→ Prompt 3 ──────→ Response C? or A?
```

### Failure Point 1: Backend Message Handling
**Question**: Is the message being received and used correctly?
**Evidence from logs**:
- `[interrogate_suspect] Message:` shows different text for each question?
- `[_call_llm] User prompt to be sent to LLM:` shows different content?

**If DIFFERENT**: Message handling is OK, issue is deeper
**If IDENTICAL**: Message not being sent properly from frontend

### Failure Point 2: LLM Prompt Construction
**Question**: Is the full prompt (including history and message) being sent correctly?
**Evidence from logs**:
- `[_call_llm] User prompt...` shows different prompts for different questions?
- Prompt includes the detective's current message?

**If DIFFERENT**: Prompt construction is OK, issue is LLM response
**If IDENTICAL**: Prompt construction is broken

### Failure Point 3: LLM Response Generation
**Question**: Is the LLM returning identical responses despite different prompts?
**Evidence from logs**:
- `[_generate_anthropic] Received response:` shows identical text?
- `[generate_json] Raw LLM text:` shows identical output?

**If IDENTICAL**: LLM is broken or caching
**If DIFFERENT**: System is actually working correctly

---

## Quick Start: Running the Diagnosis

### Step 1: Start Backend with Logging (5 seconds)
```bash
cd /Users/adithyareddy/Documents/AI\ Projects/casebreaker/backend
python -m uvicorn main:app --reload 2>&1 | tee server.log
```

This captures all stderr output to `server.log` and the console.

### Step 2: Start a Game Session (2 minutes)
Using curl, API client, or the frontend UI:
1. GET `/daily-slots` → get a slot_id
2. POST `/sessions/start` with slot_id → get session_id
3. Start interrogation on a suspect

### Step 3: Ask Three Different Questions (1 minute)
To the SAME suspect, in rapid succession:
```
Q1: "Where were you when the murder happened?"
Q2: "What do you know about the murder weapon?"
Q3: "How did you feel about the victim?"
```

### Step 4: Check Logs (2 minutes)
```bash
grep "\[interrogate_suspect\]\|\[_call_llm\]\|\[generate_json\]" server.log | head -100
```

Look for patterns:
- Are message hashes different?
- Are prompts different?
- Are responses identical?

### Step 5: Analyze (5-10 minutes)
Based on log output, determine which failure point applies.

---

## Log Analysis Patterns

### Pattern 1: Different Messages, Different Responses ✅
```
[interrogate_suspect] Message: Where were you when the murder happened?
[_call_llm] LLM response: I was in my study reviewing contracts.

[interrogate_suspect] Message: What do you know about the murder weapon?
[_call_llm] LLM response: I... I'm not sure what weapon you mean exactly.

[interrogate_suspect] Message: How did you feel about the victim?
[_call_llm] LLM response: That's a difficult question. We had our disagreements.
```
**Verdict**: System is working correctly. Bug is in UI or user perception.

### Pattern 2: Same Messages Sent Repeatedly ❌
```
[interrogate_suspect] Message: Where were you when the murder happened?
[_call_llm] User prompt: Detective asks: Where were you when the murder happened?
[_call_llm] LLM response: I was in my study reviewing contracts.

[interrogate_suspect] Message: Where were you when the murder happened?
[_call_llm] User prompt: Detective asks: Where were you when the murder happened?
[_call_llm] LLM response: I was in my study reviewing contracts.
```
**Verdict**: Frontend is sending same message repeatedly. Check InterrogationRoom.tsx input handling.

### Pattern 3: Different Messages, Identical Prompts ❌
```
[interrogate_suspect] Message: Where were you?
[_call_llm] User prompt: ... Detective asks: Where were you? ...

[interrogate_suspect] Message: About the weapon?
[_call_llm] User prompt: ... Detective asks: Where were you? ...
```
**Verdict**: Message is received but not included in LLM prompt. Bug in _call_llm().

### Pattern 4: Different Prompts, Identical Responses ❌
```
[_call_llm] User prompt: ... Where were you? ...
[_generate_anthropic] Received response: I was in my study reviewing contracts.

[_call_llm] User prompt: ... About the weapon? ...
[_generate_anthropic] Received response: I was in my study reviewing contracts.
```
**Verdict**: LLM is caching responses or broken. Check Anthropic API behavior.

---

## What Each Log Statement Tells You

```python
# Line in character.py
print(f"[interrogate_suspect] START - suspect={suspect.name}, message_hash={hash(message)}", file=sys.stderr)
→ Shows: suspect name, message hash (should change for different questions)

print(f"[interrogate_suspect] Message: {message[:100]}", file=sys.stderr)
→ Shows: first 100 chars of message (should be different for different questions)

print(f"[_format_history] History length: {len(history)}, last 6 turns will be used", file=sys.stderr)
→ Shows: how many prior exchanges are included (grows with conversation)

print(f"[_call_llm] User prompt to be sent to LLM:", file=sys.stderr)
print(f"---USER_PROMPT_START---", file=sys.stderr)
print(user_prompt[:300], file=sys.stderr)
→ Shows: actual prompt being sent to Claude (should differ between questions)

print(f"[_call_llm] LLM response: {reply[:100]}", file=sys.stderr)
→ Shows: raw response from Claude (should differ if prompts differ)

print(f"[generate_json] User message hash: {hash(user)}", file=sys.stderr)
→ Shows: hash of user prompt to generate_json (debugging caching)
```

---

## Expected Timeline

**First interrogation**:
```
[interrogate_suspect] Message: Where were you when the murder happened?
[_format_history] History length: 0
[_call_llm] User prompt (showing full prompt)
[generate_json] Calling LLM
[_generate_anthropic] Sending request to Claude
[_generate_anthropic] Received response: I was in the study...
```

**Second interrogation (same suspect)**:
```
[interrogate_suspect] Message: What about the murder weapon?
[_format_history] History length: 2  ← increased (detective Q + suspect A)
[_call_llm] User prompt (showing DIFFERENT prompt with new Q + old history)
[generate_json] Calling LLM
[_generate_anthropic] Sending request to Claude
[_generate_anthropic] Received response: I don't know about any...
```

History grows but each prompt is unique. Responses should vary.

---

## Files to Check Based on Findings

**If messages are identical**: 
- `game/components/screens/interrogation/InterrogationRoom.tsx` (line 160)
- `game/lib/backend-client.ts` (line 106)

**If prompts are identical**:
- `backend/agents/character.py` - _call_llm() function
- `utils/prompts.py` - INTERROGATION_USER_PROMPT template

**If responses are identical**:
- `backend/agents/llm_provider.py` - generate_json() or _generate_anthropic()
- Check Anthropic API request/response caching (enterprise feature?)

**If history is wrong**:
- `backend/api/routes.ts` - interrogate_session() function
- `backend/agents/character.py` - _format_history() function

---

## Cleanup Instructions

Once bug is fixed, remove diagnostic logging:

```bash
git checkout backend/agents/character.py
git checkout backend/agents/llm_provider.py
```

Or manually delete:
- All lines containing `print(f"[...")`
- All `import sys` statements added by logging

---

## Still Stuck?

If logs don't make sense, try:

1. **Check server startup**:
   ```bash
   python -m uvicorn main:app --reload
   ```
   Should show "Uvicorn running on http://127.0.0.1:8000"

2. **Verify backend is running**:
   ```bash
   curl http://127.0.0.1:8000/daily-slots
   ```
   Should return JSON, not connection error

3. **Check if interrogation hits backend**:
   ```bash
   # In logs, look for: "[interrogate_suspect] START"
   ```
   If not present, request isn't reaching backend

4. **Check for Python errors**:
   ```bash
   # Look for: "Traceback", "Exception", "Error"
   ```
   Would indicate code error, not logic error

5. **Save full logs for analysis**:
   ```bash
   python -m uvicorn main:app --reload > full_server.log 2>&1 &
   # Run test
   # Send log file for analysis
   ```

---

## Summary

✅ **Diagnostic infrastructure in place**
✅ **Frontend code reviewed (correct)**
✅ **Backend logging added**
✅ **Test procedure documented**

⏳ **Awaiting**: Test execution and log analysis to pinpoint exact failure location

**Your next action**: Run server with logging, conduct test interrogation, and report what the logs show.
