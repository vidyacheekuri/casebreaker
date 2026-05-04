import { z } from "zod";

export const VictimSchema = z.object({
  name: z.string(),
  age: z.number(),
  occupation: z.string(),
  cause_of_death: z.string(),
  time_of_death: z.string().optional().default(""),
});

export const EvidenceSchema = z.object({
  evidence_id: z.string(),
  name: z.string(),
  location: z.string(),
  description: z.string(),
  implicates: z.string(),
  is_red_herring: z.boolean(),
  image_url: z.string().nullable().optional(),
  image_prompt: z.string().nullable().optional(),
  image_status: z.string().optional(),
  image_version: z.string().nullable().optional(),
});

export const SuspectSchema = z.object({
  character_id: z.string(),
  name: z.string(),
  age: z.number(),
  occupation: z.string(),
  relationship_to_victim: z.string(),
  motive: z.string().optional().default(""),
  personality: z.string(),
  alibi: z.string(),
  alibi_true: z.boolean(),
  secret: z.string(),
  knowledge: z.array(z.string()),
  is_killer: z.boolean(),
  archetype: z.string(),
  speech_style: z.string().optional(),
  emotional_tell: z.string().optional(),
  lie_strategy: z.string().optional(),
  private_wound: z.string().optional(),
  pressure_response: z.string().optional(),
  relationship_to_other_suspects: z.string().optional(),
  gender_presentation: z.string().nullable().optional(),
  appearance: z.string(),
  model_url: z.string().nullable(),
  model_path: z.string().nullable(),
  voice_id: z.string().nullable(),
});

export const TimelineEventSchema = z.object({
  time: z.string().optional(),
  event: z.string().optional(),
  witnessed_by: z.array(z.string()).optional(),
});

export const InvestigationRoomSchema = z.object({
  room_id: z.string(),
  name: z.string(),
  description: z.string(),
  evidence_ids: z.array(z.string()),
  clue_count: z.number(),
});

export const CaseRecipeSchema = z.object({
  subgenre: z.string(),
  setting: z.string(),
  mood: z.string(),
  motive_family: z.string(),
  victim_role: z.string(),
  central_conflict: z.string(),
  killer_pressure: z.string(),
  clue_styles: z.array(z.string()),
  red_herring_strategy: z.string(),
  narrative_twist: z.string(),
  forbidden_repeats: z.array(z.string()),
});

export const GenerationSourcesSchema = z.object({
  fbi_id: z.string(),
  persona_ids: z.array(z.string()),
  literary_ids: z.array(z.string()),
});

export const DailySlotSchema = z.object({
  slot_id: z.string(),
  slot_index: z.number(),
  case_date: z.string(),
  generated_at: z.string(),
  expires_at: z.string(),
  title: z.string(),
  summary: z.string(),
  mood: z.string(),
  setting: z.string(),
  backstory: z.string().default(""),
  crime_scene_detail: z.string().default(""),
  stakes: z.string().default(""),
  timeline_context: z.string().default(""),
  victim: VictimSchema,
  suspects: z.array(SuspectSchema),
  evidence: z.array(EvidenceSchema),
  rooms: z.array(InvestigationRoomSchema).optional(),
  timeline: z.array(TimelineEventSchema).optional(),
  case_recipe: CaseRecipeSchema.nullable().optional(),
  generation_sources: GenerationSourcesSchema.nullable().optional(),
  world_collection: z.string(),
});

export const DailyKeywordSchema = z.object({
  keyword_id: z.string(),
  label: z.string(),
  category: z.string(),
  slot_scores: z.record(z.string(), z.number()),
});

export const DailySlotsResponseSchema = z.object({
  slots: z.array(DailySlotSchema),
  daily_keywords: z.array(DailyKeywordSchema),
  generated_at: z.string().nullable(),
  expires_at: z.string().nullable(),
});

export const DailySlotsMatchResponseSchema = z.object({
  matched_slot_id: z.string(),
  matched_slot_index: z.number(),
  matched_title: z.string(),
  matched_summary: z.string(),
  matched_score: z.number(),
  score_breakdown: z.record(z.string(), z.number()),
  matched_keyword_labels: z.array(z.string()),
});

export const SessionStartResponseSchema = z.object({
  session_id: z.string(),
  slot_id: z.string(),
  case_date: z.string(),
  started_at: z.string(),
});

export const DetectiveInstinctSchema = z.object({
  quote: z.string(),
  source_title: z.string(),
  source_author: z.string(),
  trigger: z.string(),
});

export const InterrogateResponseSchema = z.object({
  session_id: z.string(),
  character_id: z.string(),
  character_name: z.string(),
  reply: z.string(),
  tone: z.string(),
  detective_instinct: DetectiveInstinctSchema.nullable(),
});

export const SessionStateSchema = z.object({
  session_id: z.string(),
  slot_id: z.string(),
  case_date: z.string(),
  suspects_interrogated: z.array(z.string()),
  evidence_examined: z.array(z.string()),
  player_claims: z.array(z.string()),
  contradictions_found: z.array(z.string()),
  suspicion_scores: z.record(z.string(), z.number()),
  instincts_shown: z.array(z.string()),
  accusation_made: z.boolean(),
  accusation_correct: z.boolean().nullable(),
  solve_time_seconds: z.number().nullable(),
  session_start_time: z.string(),
});

export const InterrogationTurnSchema = z.object({
  character_id: z.string(),
  speaker: z.string(),
  text: z.string(),
  tone: z.string().nullable(),
  timestamp: z.string(),
});

export const SessionStateResponseSchema = z.object({
  session_id: z.string(),
  slot_id: z.string(),
  started_at: z.string(),
  state: SessionStateSchema,
  transcript: z.array(InterrogationTurnSchema),
});

export const AccuseResponseSchema = z.object({
  session_id: z.string(),
  correct: z.boolean(),
  accused_id: z.string(),
  accused_name: z.string(),
  killer_id: z.string(),
  killer_name: z.string(),
  verdict_summary: z.string(),
  missed_clues: z.array(z.string()),
  solve_time_seconds: z.number().nullable(),
});
