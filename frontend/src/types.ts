export type ThemeName = "cyberpunk" | "arcane";

export interface Character {
  id: number;
  name: string;
  world_key: string;
  tagline: string;
  scenario: string;
  system_prompt: string;
  greeting: string;
  theme: string;
  avatar_url: string;
  is_builtin: boolean;
  created_at: string;
}

export interface Persona {
  id: number;
  name: string;
  description: string;
  avatar_url: string;
  created_at: string;
}

export interface StorySession {
  id: number;
  character_id: number | null;
  persona_id: number | null;
  title: string;
  character_name: string;
  scenario_context: string;
  theme: string;
  summary_memory: string;
  summarized_up_to_id: number;
  model_name: string | null;
  temperature: number;
  top_p: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface StoryMessage {
  id: number;
  session_id: number;
  role: "user" | "assistant";
  content: string;
  variants: string[];
  active_variant: number;
  created_at: string;
}

export interface LorebookEntry {
  id: number;
  session_id: number | null;
  character_id: number | null;
  title: string;
  keywords: string;
  content: string;
  always_active: boolean;
  created_at: string;
}

export interface WebSearchHit {
  title: string;
  snippet: string;
  source_label: string;
  api_url: string;
  page_url: string;
}

export interface WebImportPreview {
  title: string;
  keywords: string;
  content: string;
  source_url: string;
}

export type StreamEvent =
  | { type: "user_saved"; message: StoryMessage }
  | { type: "token"; text: string }
  | { type: "done"; message: StoryMessage }
  | { type: "error"; detail: string };
