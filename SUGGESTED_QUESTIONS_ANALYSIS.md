# Suggested Questions Improvement Analysis

## What Changed

### New Parameters Added
```typescript
// Before: 4 parameters
buildSuggestedQuestions(suspect, messages, selectedEvidence, contradictoryEvidence)

// After: 7 parameters (3 new ones)
buildSuggestedQuestions(
  suspect,
  messages,
  selectedEvidence,
  contradictoryEvidence,
  allSuspects,        // ← NEW: Other suspects for comparative questions
  activeSlot,         // ← NEW: Slot data for timeline/setting
  stress              // ← NEW: Stress level for escalation
)
```

### New Context Extraction (Lines 83-92)
```typescript
const otherSuspects = allSuspects.filter(...)           // Get non-this suspects
const relevantTimeline = activeSlot?.timeline?.find... // Find timeline events mentioning suspect
const trait = suspect.archetype || suspect.occupation   // What type of person
const wound = suspect.private_wound || suspect.secret   // Psychological vulnerability
const pressureTarget = suspect.motive || suspect.secret // What to probe
```

**Impact**: Questions now have access to comparative data and psychological profiles.

---

## Question Quality Improvements

### 1. Follow-Up Phrases (Lines 95-97)
**Before**:
```typescript
`When you said "${followUpPhrase}", what exactly did you mean?`
```

**After**:
```typescript
`When you said "${followUpPhrase}", what were you trying to leave unsaid?`
```

✅ **Why better**: 
- "Leave unsaid" implies investigator knows they're hiding something
- More accusatory tone
- Psychological pressure

---

### 2. Evidence Interrogation (Lines 99-109)

**Single Evidence (Before)**:
```typescript
`What do you know about ${selectedEvidence[0].name}?`
```

**Single Evidence (After)**:
```typescript
`${contradictoryEvidence[0].name} points back to you. What part of your story does it not fit?`
```

✅ **Why better**:
- Directly implicates suspect
- Forces them to reconcile with evidence
- Accusatory (not open-ended)

**Multiple Evidence (NEW)**:
```typescript
`Two clues now touch your account: ${contradictoryEvidence[0].name} and ${contradictoryEvidence[1].name}. Which one worries you more?`
```

✅ **Why this works**:
- Shows detective has assembled evidence
- Forces them to pick one to defend (pressure)
- Implies they can't defend both

**Unmentioned Evidence (NEW)**:
```typescript
`You have not mentioned ${selectedEvidence[0].name}. Why would that detail matter tonight?`
```

✅ **Why clever**:
- Shows detective notices what wasn't said
- Forces explanation for deliberate omission
- Suggests detective knows it matters

---

### 3. Timeline Integration (Lines 111-113)
**Completely NEW**:
```typescript
`At ${relevantTimeline.time ?? "that point"}, ${relevantTimeline.event ?? "your name enters the timeline"}. What are we missing there?`
```

✅ **Why powerful**:
- Uses concrete timeline events
- Grounds interrogation in case facts
- Forces explanation of specific moment
- Shows detective has timeline (authority)

---

### 4. Tone-Responsive Questions (Lines 115-117)

**Before**:
```typescript
"You sound careful. What are you trying not to say?"  // Same for all tones
```

**After**:
```typescript
`That sounded ${latestTone}. Which part of my question made you careful?`
```

✅ **Why better**:
- Names the specific tone they showed
- More conversational
- Shows detective is paying attention
- Different for each tone (guarded/defensive/nervous/etc)

---

### 5. Stress-Based Escalation (Lines 124-130)

**Completely NEW logic**:
```typescript
if (stress >= 65) {
  // High stress: Hit them with their wound directly
  `${trimForQuestion(wound, 80)} keeps coming up around you. Why should I believe it did not shape your choices?`
} else if (stress >= 35) {
  // Medium stress: Probe their pressure point
  `You are getting careful now. Is this about ${trimForQuestion(pressureTarget, 80)}?`
} else {
  // Low stress: Use their archetype for psychological insight
  `As a ${trait}, you know how people read a room. Who looked most afraid after the death?`
}
```

✅ **Why this is intelligent**:
- **High stress**: "Your wound keeps coming up" - Direct accusation with their vulnerability
- **Medium stress**: "Getting careful" - Observes behavior change, probes weak point
- **Low stress**: Uses their expertise against them (merchant/doctor/etc has skills that matter)
- **Adaptive**: Same function produces different pressure based on situation

---

### 6. Other Suspects References (Lines 132-138)

**First Other Suspect**:
```typescript
`${otherSuspects[0].name} gives a very different account of the night. What would they gain by shading the truth?`
```

✅ **Why effective**:
- Creates competitive pressure
- Implies suspect A is better at lying
- Forces them to explain motive for lying
- Divides suspects

**Second Other Suspect**:
```typescript
`${otherSuspects[1].name} had their own reason to watch the victim. Did you see them near ${activeSlot?.setting ?? "the scene"}?`
```

✅ **Why clever**:
- "Had their own reason" - Admits suspect B had motive too
- Asks if they saw suspect B at crime scene
- If yes: Alibi witness but suspicious presence
- If no: They weren't looking? Or hiding that they saw?

---

### 7. Better Generic Fallbacks (Lines 140-145)

**Before**:
```typescript
"Where were you at the time of the death?"
"Walk me through your alibi in detail."
"What was your last private conversation with the victim?"
"Why would someone think you had a reason to harm the victim?"
"How would you describe your relationship to the victim (${suspect.relationship_to_victim})?"
"What are you leaving out about that night?"
```

**After**:
```typescript
`Your relationship to the victim was "${trimForQuestion(suspect.relationship_to_victim, 70)}". Where did that relationship turn sour?`
`What would the victim have said about you if they were still alive?`
`Who benefits if I stop looking at you and start looking elsewhere?`
`What are you leaving out because it sounds worse than it is?`
```

✅ **Why better**:
1. **Relationship turn sour**: Assumes conflict, forces explanation
2. **What victim would say**: Psychological (victim can't defend themselves)
3. **Who benefits**: Makes them think about other suspects/motives
4. **Sounds worse**: Acknowledges they're hiding something, invites confession

---

## New Helper Function (Lines 153-159)

```typescript
function trimForQuestion(value: string | undefined, maxLength: number): string {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "that";
  }
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}...` : cleaned;
}
```

✅ **Why needed**:
- Safely embeds long strings in questions
- Falls back to "that" instead of empty string
- Prevents malformed questions
- Handles whitespace cleanup

---

## Impact on Gameplay

### Before
- Same 6 generic questions for all suspects
- No adaptation to stress, archetype, or situation
- Open-ended ("What do you know about X?")
- No comparative pressure (no mention of other suspects)
- Low detective intelligence

### After
- Dynamic questions based on:
  - ✅ Stress level (3 different pressure tiers)
  - ✅ Suspect archetype/occupation
  - ✅ Timeline events
  - ✅ Other suspects' statements
  - ✅ Evidence contradictions
- Accusatory tone (not open-ended)
- Shows detective intelligence
- Psychological pressure
- Creates narrative tension

---

## What InterrogationRoom.tsx Needs Updated

The function signature changed, so the call needs updating:

**Current (line 209 in InterrogationRoom.tsx)**:
```typescript
const suggestedQuestions = buildSuggestedQuestions(
  suspect,
  messages,
  selectedEvidence,
  contradictoryEvidence
);
```

**Should be**:
```typescript
const suggestedQuestions = buildSuggestedQuestions(
  suspect,
  messages,
  selectedEvidence,
  contradictoryEvidence,
  activeSlot?.suspects ?? [],    // All suspects
  activeSlot,                     // The active slot with timeline
  stress                          // Current suspect stress
);
```

---

## Quality Assessment

| Aspect | Before | After | Grade |
|--------|--------|-------|-------|
| Context awareness | Generic | Contextual | A+ |
| Suspect profiling | None | Archetype-aware | A+ |
| Evidence use | Weak | Strategic | A |
| Pressure escalation | Static | Dynamic | A+ |
| Comparative tactics | None | Multi-suspect | A |
| Psychological depth | Low | High | A |
| Natural language | Awkward | Detective-like | A |
| Stress adaptation | None | 3-tier system | A+ |
| Timeline integration | None | Concrete | A+ |

---

## Remaining Opportunities

**Could still add**:
1. **Contradiction exploitation**: "Earlier you said X, now you say Y"
2. **Method knowledge**: "Would someone with your background know how to...?"
3. **Motive cascade**: "First you claim innocence, but you had motive because..."
4. **Alibi destruction**: "Your alibi depends on [person], but they say..."
5. **Guilt signals**: "You avoided that question. Why?"

But honestly, this rewrite is **substantially better** and the suggested questions are now **genuinely good**.

---

## Summary

✅ **This is a significant upgrade**. The questions are now:
- Character-specific (archetype-aware)
- Context-aware (timeline/other suspects)
- Psychologically sound (stress-escalation)
- Detective-like (accusatory, not open-ended)
- Dynamic (changes based on situation)

The implementation is clean, uses the data available, and produces questions that feel like an actual detective is interrogating, not an NPC following a script.

**Grade: A- (excellent improvement)**
