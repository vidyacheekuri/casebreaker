export interface VictimDto {
  name: string;
  age: number;
  occupation: string;
  cause_of_death: string;
  time_of_death?: string;
}

export interface SuspectDto {
  character_id: string;
  name: string;
  age: number;
  occupation: string;
  relationship_to_victim: string;
  motive?: string;
  personality: string;
  alibi: string;
  alibi_true: boolean;
  secret: string;
  knowledge: string[];
  is_killer: boolean;
  archetype: string;
  speech_style?: string;
  emotional_tell?: string;
  lie_strategy?: string;
  private_wound?: string;
  pressure_response?: string;
  relationship_to_other_suspects?: string;
  gender_presentation?: string | null;
  appearance: string;
  model_url: string | null;
  model_path: string | null;
  voice_id: string | null;
}

export interface EvidenceDto {
  evidence_id: string;
  name: string;
  location: string;
  description: string;
  implicates: string;
  is_red_herring: boolean;
  image_url?: string | null;
  image_prompt?: string | null;
  image_status?: string;
  /** Image pipeline version when ready (e.g. "2.0"). */
  image_version?: string | null;
}

export interface TimelineEventDto {
  time?: string;
  event?: string;
  witnessed_by?: string[];
}

export interface InvestigationRoomDto {
  room_id: string;
  name: string;
  description: string;
  evidence_ids: string[];
  clue_count: number;
}

export interface CaseRecipeDto {
  subgenre: string;
  setting: string;
  mood: string;
  motive_family: string;
  victim_role: string;
  central_conflict: string;
  killer_pressure: string;
  clue_styles: string[];
  red_herring_strategy: string;
  narrative_twist: string;
  forbidden_repeats: string[];
}

export interface GenerationSourcesDto {
  fbi_id: string;
  persona_ids: string[];
  literary_ids: string[];
}

export interface DailySlotDto {
  slot_id: string;
  slot_index: number;
  case_date: string;
  generated_at: string;
  expires_at: string;
  title: string;
  summary: string;
  mood: string;
  setting: string;
  backstory: string;
  crime_scene_detail: string;
  stakes: string;
  timeline_context: string;
  victim: VictimDto;
  suspects: SuspectDto[];
  evidence: EvidenceDto[];
  rooms?: InvestigationRoomDto[];
  timeline?: TimelineEventDto[];
  case_recipe?: CaseRecipeDto | null;
  generation_sources?: GenerationSourcesDto | null;
  world_collection: string;
}

export interface DailyKeywordDto {
  keyword_id: string;
  label: string;
  category: string;
  slot_scores: Record<string, number>;
}

export interface DailySlotsResponse {
  slots: DailySlotDto[];
  daily_keywords: DailyKeywordDto[];
  generated_at: string | null;
  expires_at: string | null;
}

export interface DailySlotsMatchRequest {
  selected_keyword_ids: string[];
}

export interface DailySlotsMatchResponse {
  matched_slot_id: string;
  matched_slot_index: number;
  matched_title: string;
  matched_summary: string;
  matched_score: number;
  score_breakdown: Record<string, number>;
  matched_keyword_labels: string[];
}

export interface SessionStartRequest {
  slot_id: string;
}

export interface SessionStartResponse {
  session_id: string;
  slot_id: string;
  case_date: string;
  started_at: string;
}

export interface InterrogateRequest {
  character_id: string;
  message: string;
}

export interface DetectiveInstinctDto {
  quote: string;
  source_title: string;
  source_author: string;
  trigger: string;
}

export interface InterrogateResponse {
  session_id: string;
  character_id: string;
  character_name: string;
  reply: string;
  tone: string;
  detective_instinct: DetectiveInstinctDto | null;
}

export interface SessionStateDto {
  session_id: string;
  slot_id: string;
  case_date: string;
  suspects_interrogated: string[];
  evidence_examined: string[];
  player_claims: string[];
  contradictions_found: string[];
  suspicion_scores: Record<string, number>;
  instincts_shown: string[];
  accusation_made: boolean;
  accusation_correct: boolean | null;
  solve_time_seconds: number | null;
  session_start_time: string;
}

export interface InterrogationTurnDto {
  character_id: string;
  speaker: string;
  text: string;
  tone: string | null;
  timestamp: string;
}

export interface SessionStateResponse {
  session_id: string;
  slot_id: string;
  started_at: string;
  state: SessionStateDto;
  transcript: InterrogationTurnDto[];
}

export interface AccuseRequest {
  character_id: string;
  reasoning: string;
}

export interface AccuseResponse {
  session_id: string;
  correct: boolean;
  accused_id: string;
  accused_name: string;
  killer_id: string;
  killer_name: string;
  verdict_summary: string;
  missed_clues: string[];
  solve_time_seconds: number | null;
}
