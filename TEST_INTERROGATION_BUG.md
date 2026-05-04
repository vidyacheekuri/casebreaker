# Interrogation Bug Test Procedure

## Quick Test (5-10 minutes)

### Step 1: Start the server with stderr output visible

```bash
cd /Users/adithyareddy/Documents/AI\ Projects/casebreaker/backend
python -m uvicorn main:app --reload 2>&1 | tee server.log
```

This will:
- Start the FastAPI server
- Capture all output (including stderr logging)
- Save to server.log for later analysis

### Step 2: In another terminal, start a game session

Use curl or your API client to:

```bash
# 1. Get today's slots
curl -X GET "http://localhost:8000/daily-slots?date=2026-05-01"

# Record the slot_id from the response (e.g., "slot_abc123")

# 2. Start a new session on that slot
curl -X POST "http://localhost:8000/sessions/start" \
  -H "Content-Type: application/json" \
  -d '{"slot_id": "slot_abc123"}'

# Record the session_id from the response (e.g., "sess_xyz789")

# 3. Get the characters in the world to find a suspect
curl -X GET "http://localhost:8000/sessions/sess_xyz789"

# Record one character's character_id (e.g., "suspect_1")
```

### Step 3: Test interrogation with 3 different questions

```bash
# Question 1: Alibi-focused
curl -X POST "http://localhost:8000/sessions/sess_xyz789/interrogate" \
  -H "Content-Type: application/json" \
  -d '{
    "character_id": "suspect_1",
    "message": "Where were you when the murder happened? Walk me through that evening."
  }'

# Question 2: Evidence-focused
curl -X POST "http://localhost:8000/sessions/sess_xyz789/interrogate" \
  -H "Content-Type: application/json" \
  -d '{
    "character_id": "suspect_1",
    "message": "Did you see the glove that was found in the study? What do you know about it?"
  }'

# Question 3: Motive-focused
curl -X POST "http://localhost:8000/sessions/sess_xyz789/interrogate" \
  -H "Content-Type: application/json" \
  -d '{
    "character_id": "suspect_1",
    "message": "You had a lot to gain from the victim'\''s death. What do you say to that?"
  }'
```

### Step 4: Analyze the logs

Check the server.log file for patterns:

```bash
grep "\[interrogate_suspect\]\|\[_call_llm\]\|\[_format_history\]" server.log
```

**Look for:**

1. **Different messages?**
   - First interrogate line should show different message_hash values
   - "Message:" lines should show different text

2. **Different LLM prompts?**
   - "User prompt to be sent to LLM:" sections should differ
   - Look for different "Detective asks:" content

3. **Different LLM responses?**
   - "LLM response:" lines should show different text
   - Same response across different prompts = problem

4. **Using offline fallback?**
   - Look for "Empty reply from LLM, using offline fallback"
   - Offline fallback SHOULD vary by question type

## What Different Output Means

### Healthy: All different
```
Message: Where were you when the murder happened?
...
LLM response: I was in my study reviewing contracts all evening.

Message: Did you see the glove?
...
LLM response: I... I'm not sure what glove you mean exactly.

Message: You had a lot to gain from the victim's death?
...
LLM response: That's not fair. Everyone has problems. It doesn't mean I killed anyone.
```
✅ System is working correctly

### Bug: All same
```
Message: Where were you when the murder happened?
...
LLM response: I was in my study reviewing contracts.

Message: Did you see the glove?
...
LLM response: I was in my study reviewing contracts.

Message: You had a lot to gain from the victim's death?
...
LLM response: I was in my study reviewing contracts.
```
❌ Messages are being sent correctly but responses are identical

## Detailed Log Analysis

If responses are identical, check these patterns:

1. **Is the message actually different?**
   ```
   [interrogate_suspect] Message: Where were you when...
   [interrogate_suspect] Message: Did you see the glove...
   [interrogate_suspect] Message: You had a lot to gain...
   ```
   If these are different, message is being received correctly.

2. **Is the user_prompt different?**
   ```
   Detective asks: Where were you when the murder happened?
   ...
   Detective asks: Did you see the glove that was found?
   ...
   Detective asks: You had a lot to gain from the victim's death?
   ```
   If these are different, LLM is getting different input.

3. **Is the LLM response different?**
   ```
   [_call_llm] LLM response: I was in my study reviewing...
   [_call_llm] LLM response: I was in my study reviewing...
   [_call_llm] LLM response: I was in my study reviewing...
   ```
   If these are IDENTICAL despite different prompts, the issue is in the LLM layer.

4. **Is offline fallback being used?**
   ```
   [_call_llm] Empty reply from LLM, using offline fallback
   ```
   If present, _offline_reply() should vary by message anyway.

## Next Steps Based on Findings

### If messages are different but responses identical:
- Issue is in LLM response generation or caching
- Check generate_json() in llm_provider.py
- Check if there's middleware-level caching
- Check OpenAI/Claude API response caching behavior

### If messages are identical:
- Issue is in message parsing or request handling
- Check InterrogateRequest parsing
- Check if frontend is sending same message
- Check routes.py payload.message extraction

### If responses are different:
- System is actually working correctly!
- Issue might be on the frontend (UI display)
- Check if frontend is showing cached responses
