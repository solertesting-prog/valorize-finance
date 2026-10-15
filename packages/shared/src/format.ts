/** Utilidades de formato con zona horaria explícita (Intl, sin dependencias). */

export function formatTime(iso: string, timeZone: string, locale = 'es-ES'): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(
    new Date(iso),
  );
}

export function formatDate(iso: string, timeZone: string, locale = 'es-ES'): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(
    new Date(iso),
  );
}

export function formatDateLong(iso: string, timeZone: string, locale = 'es-ES'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, timeZone: string, locale = 'es-ES'): string {
  return `${formatDate(iso, timeZone, locale)} · ${formatTime(iso, timeZone, locale)}`;
}

/** "AAAA-MM-DD" de hoy en una zona horaria. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function fullName(u: { firstName: string; lastName: string }): string {
  return `${u.firstName} ${u.lastName}`.trim();
}

export function relativeTime(iso: string, locale = 'es'): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}
