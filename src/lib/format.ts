/** Formats a UTC timestamp in the viewer's assigned time zone, always naming the zone. */
export function formatDateTime(iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
    ...opts,
  }).format(new Date(iso));
}

export function timeZoneLabel(timeZone: string, at = new Date()) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

export const TIMEZONE_OPTIONS = [
  { value: "Asia/Karachi", label: "Pakistan (PKT)" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "America/Chicago", label: "US Central" },
  { value: "America/Denver", label: "US Mountain" },
  { value: "America/Los_Angeles", label: "US Pacific" },
  { value: "Europe/London", label: "UK (London)" },
  { value: "UTC", label: "UTC" },
] as const;

/** Offset in minutes of a time zone at a given instant (e.g. Asia/Karachi -> 300). */
function zoneOffsetMinutes(timeZone: string, at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** "2026-11-20T09:00" entered in timeZone -> UTC ISO string, or null if invalid. */
export function localInputToUtc(value: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Two passes handle instants near a daylight-saving change.
  let utc = naive - zoneOffsetMinutes(timeZone, new Date(naive)) * 60000;
  utc = naive - zoneOffsetMinutes(timeZone, new Date(utc)) * 60000;
  return new Date(utc).toISOString();
}

/** UTC ISO string -> "YYYY-MM-DDTHH:mm" in timeZone, for datetime-local inputs. */
export function utcToLocalInput(iso: string, timeZone: string) {
  const d = new Date(iso);
  const shifted = new Date(d.getTime() + zoneOffsetMinutes(timeZone, d) * 60000);
  return shifted.toISOString().slice(0, 16);
}
