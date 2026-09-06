// Public configuration. The Supabase anon/publishable key is safe to expose
// client-side — all access control is enforced by Row Level Security (RLS)
// policies in the database, scoped to auth.uid().
export const SUPABASE_URL = "https://iccmtviewbfnsizobdzd.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljY210dmlld2JmbnNpem9iZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NTA2MjgsImV4cCI6MjEwNDIyNjYyOH0.wP6xc0sS8wKiJaThW3txDs8crY9uj6MQqzxY1RQUtow";

// Name of the Edge Function that proxies AI generation requests (flashcards,
// quizzes, summaries) to Anthropic. See /supabase/functions/ai-generate.
export const AI_FUNCTION_NAME = "ai-generate";

// Extra Google OAuth scopes requested at sign-in (on top of the default
// openid/email/profile) so the session's provider_token can call the
// Calendar and Gmail (read-only) APIs directly. The actual Google OAuth
// client (ID + secret) is configured once in the Supabase Dashboard under
// Authentication -> Providers -> Google — see README for setup steps.
export const GOOGLE_EXTRA_SCOPES =
  "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.readonly";
