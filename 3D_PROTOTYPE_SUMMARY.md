# CaseBreaker AI — 3D Prototype Evaluation Summary

This document summarizes the progress, successes, and blockers encountered during the development of the 3D Character Interrogation prototype. Use this to evaluate whether to continue with the 3D character approach for the full game (which requires 3 agents and 3-4 figures per story).

---

## 🟢 What We Successfully Achieved
*Everything below is currently working and stable in the codebase.*

### 1. Core AI & Conversation Loop
*   **LLM Integration:** Claude Haiku successfully streams in-character responses (Dr. Fenn) based on a dynamic system prompt.
*   **Dynamic State:** The system tracks "stress" based on user questions (e.g., mentioning "strychnine" or "Victoria") and updates the UI and character behavior accordingly.
*   **UI/UX:** A polished, moody interrogation UI with typewriter text effects, a stress gauge, and suggested question chips.

### 2. Audio Integration
*   **Text-to-Speech:** ElevenLabs successfully generates high-quality voice audio that plays in sync with the text responses.
*   **Fallback TTS:** Browser-native speech synthesis acts as a reliable free fallback when ElevenLabs API limits are hit.

### 3. 3D Rendering & Stability
*   **Canvas Setup:** React Three Fiber (R3F) environment is fully configured with atmospheric lighting (spotlights, ambient bounce).
*   **Interaction:** OrbitControls are fully functional. You can drag, rotate, and pinch-to-zoom without breaking the scene.
*   **Anti-Vanishing Fixes:** We successfully solved severe Three.js lifecycle bugs. The model no longer disappears when state changes, thanks to custom bounding-box math, frustum culling overrides, and moving transforms out of React state.
*   **Procedural Body Language:** The character exhibits procedural idle breathing, head swaying when speaking, and jittering when stressed, layered safely over Mixamo idle animations.

### 4. Automation Infrastructure (Code-Ready)
*   We built the underlying code to automatically select characters per-story and validate their 3D rigs (checking for bones and morph targets) before loading them into the scene.

---

## 🔴 What Failed / Is Currently Blocked
*The primary blocker is achieving realistic facial animation (Lip-Sync).*

### 1. The 3D Asset Limitation (Mixamo)
*   **The Problem:** The models we used (`brian.glb`, `soldier.glb`) from Mixamo **do not have facial rigs**. They lack "morph targets" (blendshapes) and "jaw bones".
*   **The Result:** It is physically impossible to make these specific models move their mouths. They can only nod or bob their bodies.

### 2. The Lip-Sync API Dependency
*   **The Problem:** True lip-sync requires "visemes" (timestamps telling the 3D model exactly when to make an 'Ah', 'Oh', or 'Ee' mouth shape).
*   **The Result:** ElevenLabs does not easily provide these on the basic tier, and the alternative (AWS Polly) requires AWS API keys and setup that I currently do not have.

### 3. Asset Pipeline Friction
*   Scaling this to 3-4 characters per story means you cannot just download random free models. Every single model must be specifically rigged for facial animation (e.g., via ActorCore, VRoid, or custom Blender work), which is a massive manual bottleneck for an indie/solo developer.

---

## 🧭 Strategic Options: Where to go from here?

Based on the prototype results, you have three distinct paths for the full CaseBreaker AI game:

### Option A: Pivot to 2D / Static Portraits (Recommended for Speed & Scale)
*   **How it works:** Replace the 3D canvas with high-quality 2D AI-generated portraits (e.g., Midjourney/DALL-E). Swap the image based on the character's emotion (Neutral, Stressed, Angry).
*   **Pros:** Extremely cheap, infinitely scalable (generate 100 characters easily), no rigging, no AWS keys, no 3D bugs.
*   **Cons:** Less immersive than a fully animated 3D character.

### Option B: Keep 3D, but Accept "Fake" Lip-Sync (The Compromise)
*   **How it works:** Use the current stable prototype exactly as it is. Characters use Mixamo bodies, they breathe, they bob their heads when talking, but their mouths stay closed.
*   **Pros:** You get the 3D aesthetic without the nightmare of facial rigging and viseme APIs.
*   **Cons:** Players might find the telepathic/ventriloquist effect jarring.

### Option C: Commit to the Full 3D Lip-Sync Pipeline (High Effort)
*   **How it works:** You commit to sourcing viseme-ready models (via VRoid or paid ActorCore assets) and setting up AWS Polly or a local Rhubarb lip-sync server.
*   **Pros:** Premium, AAA-feeling interrogation experience.
*   **Cons:** Very high friction. Sourcing 3-4 compatible 3D characters per story will become the most time-consuming part of your game development.

---
**Summary Verdict:** The code, UI, and AI logic are highly successful. The 3D asset pipeline is the bottleneck. If scaling quickly to many stories is your priority, **Option A or B** is the safest bet.