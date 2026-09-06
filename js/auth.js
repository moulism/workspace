import { supabase } from "./supabaseClient.js";
import { GOOGLE_EXTRA_SCOPES } from "./config.js";

const PROVIDER_TOKEN_KEY = "pw-google-provider-token";
const PROVIDER_TOKEN_EXP_KEY = "pw-google-provider-token-exp";

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(cb) {
  return supabase.auth.onAuthStateChange((event, session) => {
    // Google's access token lives only on the session right after OAuth
    // redirect/refresh, so stash it (short-lived, session storage only).
    if (session?.provider_token) {
      try {
        sessionStorage.setItem(PROVIDER_TOKEN_KEY, session.provider_token);
        sessionStorage.setItem(PROVIDER_TOKEN_EXP_KEY, String(Date.now() + 55 * 60 * 1000));
      } catch {}
    }
    cb(event, session);
  });
}

export function signInWithGoogle() {
  const redirectTo = window.location.origin + window.location.pathname;
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      scopes: GOOGLE_EXTRA_SCOPES,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });
}

export async function signOut() {
  try { sessionStorage.removeItem(PROVIDER_TOKEN_KEY); sessionStorage.removeItem(PROVIDER_TOKEN_EXP_KEY); } catch {}
  return supabase.auth.signOut();
}

/** Returns the cached Google access token if we still believe it's fresh, else null. */
export function getGoogleAccessToken() {
  try {
    const exp = Number(sessionStorage.getItem(PROVIDER_TOKEN_EXP_KEY) || 0);
    if (exp && Date.now() < exp) return sessionStorage.getItem(PROVIDER_TOKEN_KEY);
  } catch {}
  return null;
}

export function hasGoogleAccess() {
  return !!getGoogleAccessToken();
}
