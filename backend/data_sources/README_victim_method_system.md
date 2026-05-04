# Victim-Method Relationship System

## Overview
This system creates **intelligent compatibility between victim archetypes and murder methods**, ensuring that every generated mystery has:

1. **Logically sound murders** - Methods fit victim vulnerabilities
2. **Believable difficulty levels** - Difficulty matches suspect capability
3. **Contextual evidence patterns** - Clues are victim-method specific
4. **Narrative coherence** - Murder makes psychological sense
5. **Detective experience** - Player learns about both victim and killer

## The Matrix

The `victim_method_matrix.json` file maps:
- **7 victim archetypes** to
- **15 murder methods**

Each pairing includes:
- **Compatibility level** (high, medium, low, very high)
- **Narrative fit** - Why this method fits this victim
- **Vulnerability** - What makes this victim susceptible
- **Evidence pattern** - Specific clues left by this victim-method combo
- **Difficulty score** (1-10) - How hard for killer to execute
- **Believability** - How convincing as murder
- **Suspect capability** - What skills/access required
- **Detective insight** - What detective learns about victim

## How It Works in Generation

### Step 1: Select Victim
```
Random choice from 7 victim archetypes
→ respected_patriarch, ambitious_new_money, lonely_widow, etc.
```

### Step 2: Select Compatible Method
```
Look up victim in matrix
→ Find high-compatibility methods (weighted 3x)
→ Find medium-compatibility methods (weighted 2x)
→ Find low-compatibility methods (weighted 1x)
→ Randomly select weighted by compatibility
```

### Step 3: Extract Relationship Details
```
Returns victim-method pairing with:
- Why this combo makes narrative sense
- Specific evidence patterns for this combo
- Difficulty and believability scores
- What detective learns from physical evidence
```

### Step 4: Build Generation Context
```
LLM receives:
- Victim archetype details
- Murder method details
- Victim-specific vulnerabilities
- Evidence patterns unique to this combo
- Detective insights about victim-killer relationship
```

## Examples

### Example 1: Respected Patriarch + Poisoned Drink
```json
{
  "victim": "respected_patriarch",
  "method": "poisoned_drink",
  "compatibility": "high",
  "narrative_fit": "Private evening drink, ritual habit, servant brings it",
  "vulnerability": "Trusts household staff, predictable evening routine",
  "evidence_pattern": [
    "glass with residue in study",
    "servant testimony about drink preparation",
    "unopened bottle of poison",
    "victim's final words about taste"
  ],
  "difficulty": 6,
  "believability": "high",
  "detective_insight": "Old patriarch's trust in routines becomes fatal"
}
```

**Why this works:**
- Patriarch's predictable habits make poisoning easy
- Serves in private study (low witness count)
- Multiple servants could access drink (red herring potential)
- Detective realizes victim's trust was weakness

---

### Example 2: Ambitious New Money + Motor Accident
```json
{
  "victim": "ambitious_new_money",
  "method": "motor_accident",
  "compatibility": "high",
  "narrative_fit": "Victim proud of new motorcar, drives recklessly",
  "vulnerability": "Arrogance about driving skill, loves to show off vehicle",
  "evidence_pattern": [
    "brake tampered",
    "tire evidence",
    "witness to argument before drive"
  ],
  "difficulty": 8,
  "believability": "high",
  "detector_insight": "New money always dies in shiny new toys"
}
```

**Why this works:**
- Victim's pride in new motorcar is predictable
- Method requires mechanical knowledge (narrows suspects)
- High difficulty makes killer credible
- Detective learns victim's vanity was fatal

---

### Example 3: Lonely Widow + Suffocation
```json
{
  "victim": "lonely_widow",
  "method": "suffocation",
  "compatibility": "high",
  "narrative_fit": "While sleeping, pillow over face, quick and quiet",
  "vulnerability": "Sleeps deeply, lives alone or with loyal servants only",
  "evidence_pattern": [
    "pillow fiber evidence",
    "no defensive marks",
    "servant saw nothing"
  ],
  "difficulty": 6,
  "believability": "high",
  "detective_insight": "Widow's solitude made her vulnerable at night"
}
```

**Why this works:**
- Widow's loneliness and independent life create isolation
- Physical weakness = no defense possible
- Requires nighttime access (narrows suspects to household)
- Detective realizes victim's independence was tragic vulnerability

---

## Incompatibility Examples

### Tyrannical Professional + Suffocation
```
Compatibility: low
Reason: Victim would fight back, is alert/defensive
Evidence: Severe struggle marks, killer's injuries, defensive wounds
Difficulty: 4/10 (unrealistic - requires physical overpowering)
Believability: low
```

**Why this doesn't work:**
- Tyrannical professional is alert, wouldn't be caught sleeping
- Would resist violently
- Too much evidence of struggle
- Would be incredible as a murder weapon

---

### Charismatic Charlatan + Poisoned Drink
```
Compatibility: low
Reason: Charlatan notices tampering, always suspicious
Difficulty: 9/10 (nearly impossible)
Believability: low
```

**Why this doesn't work:**
- Charlatan is paranoid by nature
- Expert con artist notices poison attempts
- Would require expert sleight of hand
- Nearly impossible to execute convincingly

---

## Integration with Generation Pipeline

1. **select_diverse_elements()** now:
   - Picks victim archetype
   - Uses victim-method matrix to pick compatible method
   - Returns victim-method pairing details

2. **build_generation_context()** now includes:
   - Victim vulnerabilities
   - Method compatibility with victim
   - Difficulty score for killer
   - Specific evidence patterns for this combo
   - Detective insights unique to pairing

3. **LLM prompt** receives:
   - All above details
   - Guided to use victim-specific vulnerabilities
   - Told to include evidence patterns for this combo
   - Understands narrative fit between victim and method

## Key Benefits

✅ **Logical Murders** - Every crime makes sense given victim
✅ **Evidence Coherence** - Clues match method + victim
✅ **Difficulty Variance** - Some killers are clever, some lucky
✅ **Red Herring Potential** - Victim-method combo suggests motives
✅ **Detective Learning** - Each mystery teaches about victims
✅ **Replay Value** - Same victim + different method = different mystery

## Future Enhancements

- Track victim-method combos used (never repeat same combo)
- Create counter-incompatibilities ("Victim X is immune to Method Y")
- Add temporal factors (victim's schedule affects method viability)
- Create suspect-victim-method triangles (which suspects could do this?)
