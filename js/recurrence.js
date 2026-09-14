// Lightweight client-side recurrence expansion for calendar_events.recurrence:
//   { freq: "daily"|"weekly"|"monthly", interval: 1, byDay: [0..6 Mon..Sun]?, until: "YYYY-MM-DD"? }
// Only the master row is stored in the DB; occurrences are generated on the fly
// for whatever date range the calendar view is currently showing.

function startOfWeekMonday(d) {
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addByFreq(date, freq, n) {
  const d = new Date(date);
  if (freq === "daily") d.setDate(d.getDate() + n);
  else if (freq === "weekly") d.setDate(d.getDate() + n * 7);
  else if (freq === "monthly") d.setMonth(d.getMonth() + n);
  return d;
}

function makeOccurrence(event, startDate, durMs) {
  const start_at = startDate.toISOString();
  const end_at = durMs ? new Date(startDate.getTime() + durMs).toISOString() : event.end_at ? start_at : null;
  return { ...event, start_at, end_at, _occId: `${event.id}::${start_at}`, _isRecurring: true, _masterId: event.id };
}

/** Returns an array of occurrence objects (event-shaped) intersecting [rangeStart, rangeEnd]. */
export function expandRecurrence(event, rangeStart, rangeEnd) {
  const rec = event.recurrence;
  if (!rec || !rec.freq || rec.freq === "none") return [event];

  const interval = Math.max(1, Number(rec.interval) || 1);
  const origStart = new Date(event.start_at);
  const origEnd = event.end_at ? new Date(event.end_at) : null;
  const durMs = origEnd ? origEnd - origStart : 0;
  const until = rec.until ? new Date(rec.until + "T23:59:59") : null;
  const hardStop = until && until < rangeEnd ? until : rangeEnd;
  const results = [];

  if (rec.freq === "weekly" && Array.isArray(rec.byDay) && rec.byDay.length) {
    const origWeekStart = startOfWeekMonday(origStart);
    let weekIndex = 0;
    while (weekIndex < 300) {
      const blockStart = new Date(origWeekStart);
      blockStart.setDate(blockStart.getDate() + weekIndex * interval * 7);
      if (blockStart > hardStop) break;
      for (const dow of rec.byDay) {
        const occDate = new Date(blockStart);
        occDate.setDate(occDate.getDate() + dow);
        occDate.setHours(origStart.getHours(), origStart.getMinutes(), origStart.getSeconds(), 0);
        if (occDate < origStart || occDate > hardStop) continue;
        const occEnd = durMs ? new Date(occDate.getTime() + durMs) : occDate;
        if (occEnd < rangeStart || occDate > rangeEnd) continue;
        results.push(makeOccurrence(event, occDate, durMs));
      }
      weekIndex++;
    }
  } else {
    let n = 0;
    while (n < 500) {
      const cur = addByFreq(origStart, rec.freq, n * interval);
      if (cur > hardStop) break;
      const occEnd = durMs ? new Date(cur.getTime() + durMs) : cur;
      if (cur > rangeEnd) break;
      if (occEnd >= rangeStart) results.push(makeOccurrence(event, cur, durMs));
      n++;
    }
  }

  results.sort((a, b) => a.start_at.localeCompare(b.start_at));
  return results;
}

export const WEEKDAY_LABELS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

export function recurrenceSummary(rec) {
  if (!rec || !rec.freq || rec.freq === "none") return "";
  const n = Math.max(1, Number(rec.interval) || 1);
  let base;
  if (rec.freq === "daily") base = n === 1 ? "Denně" : `Každých ${n} dní`;
  else if (rec.freq === "weekly") {
    const days = (rec.byDay || []).map((d) => WEEKDAY_LABELS[d]).join(", ");
    base = (n === 1 ? "Týdně" : `Každých ${n} týdnů`) + (days ? ` (${days})` : "");
  } else base = n === 1 ? "Měsíčně" : `Každých ${n} měsíců`;
  if (rec.until) base += ` do ${rec.until}`;
  return base;
}
