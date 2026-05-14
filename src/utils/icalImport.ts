import { TeamGame } from '../types';

export type IcalResult = {
  games: Omit<TeamGame, 'id'>[];
  errors: string[];
};

function unfoldLines(text: string): string {
  return text.replace(/\r?\n[ \t]/g, '');
}

function parseDtstart(value: string): { date: string; time?: string } {
  const dateMatch = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!dateMatch) return { date: '' };
  const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;

  const timeMatch = value.match(/T(\d{2})(\d{2})/);
  if (!timeMatch) return { date };

  let hour = parseInt(timeMatch[1], 10);
  const min = timeMatch[2];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  return { date, time: `${hour}:${min} ${ampm}` };
}

function parseSummary(summary: string): { opponent: string; isHome: boolean } {
  const s = summary.trim();

  // "@ Opponent" or "at Opponent" → away
  const leadingAt = s.match(/^(?:@|at)\s+(.+)$/i);
  if (leadingAt) return { opponent: leadingAt[1].trim(), isHome: false };

  // "Something vs. Opponent" → home, opponent is the part after "vs"
  const vs = s.match(/^.+?\bvs\.?\s+(.+)$/i);
  if (vs) return { opponent: vs[1].trim(), isHome: true };

  // "Opponent @ Anything" → we're away
  const trailingAt = s.match(/^(.+?)\s+@\s+.+$/i);
  if (trailingAt) return { opponent: trailingAt[1].trim(), isHome: false };

  return { opponent: s, isHome: true };
}

export function parseIcal(text: string): IcalResult {
  if (!text.includes('BEGIN:VCALENDAR')) {
    return { games: [], errors: ['File does not appear to be a valid iCal (.ics) file.'] };
  }

  const games: Omit<TeamGame, 'id'>[] = [];
  const errors: string[] = [];
  const lines = unfoldLines(text).split(/\r?\n/);

  let inEvent = false;
  let props: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      props = {};
    } else if (trimmed === 'END:VEVENT') {
      inEvent = false;

      const dtstart = props['DTSTART'];
      const summary = props['SUMMARY'];

      if (!dtstart) { errors.push('An event is missing a date — skipped.'); continue; }
      if (!summary) { errors.push('An event is missing a title — skipped.'); continue; }

      const { date, time } = parseDtstart(dtstart);
      if (!date) { errors.push(`Could not parse date "${dtstart}" — skipped.`); continue; }

      const { opponent, isHome } = parseSummary(summary);
      const location = props['LOCATION']?.trim() || undefined;
      const notes = props['DESCRIPTION']?.trim() || undefined;

      games.push({ date, time, opponent, location, notes, isHome });
    } else if (inEvent) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        // Strip property parameters (e.g. DTSTART;TZID=...: → DTSTART)
        const rawKey = trimmed.slice(0, colonIdx);
        const key = rawKey.split(';')[0].toUpperCase();
        props[key] = trimmed.slice(colonIdx + 1);
      }
    }
  }

  return { games, errors };
}
