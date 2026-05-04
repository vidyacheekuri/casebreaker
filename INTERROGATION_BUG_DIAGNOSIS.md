# Interrogation Bug Diagnosis Report

## Issue
Suspects are providing identical responses to different detective questions during interrogation sessions.

## Investigation Findings

### Code Review Results

The interrogation flow is architecturally sound:

1. **Request handling (routes.py)**
   - Message is correctly extracted from InterrogateRequest (validated: min_length=1)
   - Message is passed to interrogate_suspect() function
   - History is correctly filtered from transcript for current character_id
   - Response is normalized and persisted to transcript

2. **Interrogation function (character.py:interrogate_suspect)**
   - Receives distinct message parameter for each call
   - Message is used in two places:
     - Passed to query_world_context (for RAG retrieval)
     - Passed to _call_llm() for prompt construction

3. **LLM prompt construction (character.py:_call_llm)**
   - User prompt template includes {message} placeholder: "Detective asks: {message}"
   - All three placeholders ({history}, {message}, {name}) are provided to format()
   - Message should appear verbatim in final user_prompt sent to LLM

4. **Fallback reply function (character.py:_offline_reply)**
   - IS message-aware: checks for keywords like "alibi", "motive", "secret", "evidence"
   - Would return different responses for different questions even if LLM fails
   - If offline fallback is used consistently, responses should vary by question

### Possible Root Causes

**Most Likely (Requires Test Data):**
1. **Same message being sent from frontend** - User sends identical text for multiple questions
2. **Message parsing issue** - Message being extracted as empty or same value repeatedly
3. **LLM context bleeding** - Generated response is being cached or reused across calls

**Less Likely:**
4. **History format issue** - History being formatted identically for all questions (unlikely given code review)
5. **Response object reuse** - Same response dict being returned multiple times
6. **Temperature/seed issue** - LLM using deterministic generation despite temperature=0.7

## Diagnostic Logging Added

Added stderr logging at four points:

1. **interrogate_suspect()** (entry)
   - Logs message hash and first 100 chars
   - Logs reply first 80 chars (exit)

2. **_format_history()**
   - Logs history length
   - Logs each turn: "speaker: text"
   - Logs formatted history length

3. **_call_llm()**
   - Logs user prompt first 300 chars before LLM call
   - Logs LLM response and retry attempts
   - Logs final reply after sanitization

## Next Steps to Diagnose

1. **Run the dev server and check stderr output**
   ```bash
   cd backend
   python -m uvicorn api.main:app --reload 2>&1 | grep "\[interrogate_suspect\]\|\[_call_llm\]\|\[_format_history\]"
   ```

2. **Generate a fresh mystery and interrogate the same suspect with 3 different questions**
   - Question 1: "What's your alibi?"
   - Question 2: "What do you know about the victim?"
   - Question 3: "Tell me about your secret."

3. **Check the stderr logs for:**
   - Are the messages different each time?
   - Is the user_prompt different for each call?
   - Are the LLM responses identical or different?
   - Is the offline fallback being used?

## Code Change Summary

Files modified with diagnostic logging:
- `/Users/adithyareddy/Documents/AI Projects/casebreaker/backend/agents/character.py`
  - Added logging imports and print statements to stderr
  - No business logic changes
  - All logging output is stderr only (non-blocking)

## Rollback Instructions

If logs show the issue is elsewhere, revert character.py to remove logging:
```bash
git checkout backend/agents/character.py
```

## Expected Log Output (Healthy System)

```
[interrogate_suspect] START - suspect=Eleanor Voss, message_hash=12345678, msg_len=18
[interrogate_suspect] Message: What's your alibi?
[_format_history] History length: 0, no prior exchanges
[_call_llm] User prompt to be sent to LLM:
---USER_PROMPT_START---
Recent interrogation so far (oldest first):
(no prior exchanges)

Detective asks: What's your alibi?
---USER_PROMPT_END---
[_call_llm] LLM response: I was in the library that evening, reading alone as always.
[interrogate_suspect] Reply: I was in the library that evening, reading alone as always.

[interrogate_suspect] START - suspect=Eleanor Voss, message_hash=87654321, msg_len=27
[interrogate_suspect] Message: What do you know about t...
[_format_history] History length: 2, last 6 turns will be used
[_format_history] Turn: detective: What's your alibi?
[_format_history] Turn: Eleanor Voss: I was in the library...
[_call_llm] User prompt to be sent to LLM:
---USER_PROMPT_START---
Recent interrogation so far (oldest first):
detective: What's your alibi?
Eleanor Voss: I was in the library...
Detective asks: What do you know about the victim?
---USER_PROMPT_END---
[_call_llm] LLM response: She was a difficult woman, cold and distant with everyone.
[interrogate_suspect] Reply: She was a difficult woman, cold and distant...
```

See different messages, different prompts, different responses.
