import { TeamGame } from '../types';

function escapeIcal(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function generateIcal(games: TeamGame[], teamName: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ScoreBall//ScoreBall//EN',
    `X-WR-CALNAME:${escapeIcal(teamName)} Schedule`,
    'CALSCALE:GREGORIAN',
  ];

  for (const game of games) {
    const dtstart = game.date.replace(/-/g, '');
    const uid = `${game.id || dtstart + game.opponent.replace(/\s/g, '')}@scoreball`;
    const summary = game.isHome
      ? `${teamName} vs. ${game.opponent}`
      : `${teamName} @ ${game.opponent}`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTART;VALUE=DATE:${dtstart}`);
    lines.push(`DTEND;VALUE=DATE:${dtstart}`);
    lines.push(`SUMMARY:${escapeIcal(summary)}`);
    if (game.location) lines.push(`LOCATION:${escapeIcal(game.location)}`);
    if (game.notes) lines.push(`DESCRIPTION:${escapeIcal(game.notes)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
