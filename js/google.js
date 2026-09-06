import { getGoogleAccessToken } from "./auth.js";

async function googleFetch(url, opts = {}) {
  const token = getGoogleAccessToken();
  if (!token) throw new Error("NO_GOOGLE_TOKEN");
  const res = await fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error("GOOGLE_TOKEN_EXPIRED");
  if (!res.ok) throw new Error(`Google API error ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

export function hasGoogle() {
  return !!getGoogleAccessToken();
}

export const GCal = {
  async listUpcoming(maxResults = 10) {
    const params = new URLSearchParams({
      timeMin: new Date().toISOString(),
      maxResults: String(maxResults),
      singleEvents: "true",
      orderBy: "startTime",
    });
    const data = await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`
    );
    return data.items || [];
  },
  async createEvent({ title, description, startIso, endIso, allDay, location }) {
    const body = allDay
      ? { summary: title, description, location, start: { date: startIso.slice(0, 10) }, end: { date: (endIso || startIso).slice(0, 10) } }
      : { summary: title, description, location, start: { dateTime: startIso }, end: { dateTime: endIso || startIso } };
    return googleFetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },
  async deleteEvent(googleEventId) {
    return googleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`, {
      method: "DELETE",
    });
  },
};

export const Gmail = {
  async listRecent(maxResults = 8, query = "is:unread") {
    const params = new URLSearchParams({ maxResults: String(maxResults), q: query });
    const list = await googleFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
    const ids = (list.messages || []).map((m) => m.id);
    const msgs = await Promise.all(
      ids.map((id) =>
        googleFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`
        )
      )
    );
    return msgs.map((m) => {
      const headers = m.payload?.headers || [];
      const get = (name) => headers.find((h) => h.name === name)?.value || "";
      return { id: m.id, subject: get("Subject") || "(no subject)", from: get("From"), snippet: m.snippet };
    });
  },
};
