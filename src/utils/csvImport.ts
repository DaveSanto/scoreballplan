import { Handedness, Player, Position, ALL_POSITIONS } from '../types';

export type CsvRow = Partial<Omit<Player, 'id'>> & { name: string };
export type CsvResult = { rows: CsvRow[]; errors: string[] };

const POSITION_MAP: Record<string, Position> = {
  P: 'P', C: 'C', '1B': '1B', '2B': '2B', '3B': '3B',
  SS: 'SS', LF: 'LF', CF: 'CF', RF: 'RF',
};

function parsePosition(val: string): Position | undefined {
  return POSITION_MAP[val.trim().toUpperCase()];
}

function parseHandedness(val: string): Handedness | undefined {
  const v = val.trim().toUpperCase();
  if (v === 'L' || v === 'R' || v === 'S') return v;
}

function parseThrows(val: string): 'L' | 'R' | undefined {
  const v = val.trim().toUpperCase();
  if (v === 'L' || v === 'R') return v;
}

function parseStat(val: string): number | null {
  const n = parseFloat(val.trim());
  return isNaN(n) ? null : n;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += char;
  }
  result.push(current.trim());
  return result;
}

// Expected columns (header row, case-insensitive):
// Name, Number, Email, Bats, Throws, Pos A, Pos B, Pos C, Pos D, AVG, OBP, ERA
export function parseCsv(text: string): CsvResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], errors: ['CSV has no data rows.'] };

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s/g, ''));
  const col = (name: string) => headers.indexOf(name);

  const nameIdx = col('name');
  if (nameIdx === -1) return { rows: [], errors: ['CSV must have a "Name" column.'] };

  const rows: CsvRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const name = cells[nameIdx]?.trim();
    if (!name) { errors.push(`Row ${i + 1}: missing name, skipped.`); continue; }

    const get = (idx: number) => (idx !== -1 ? cells[idx] ?? '' : '');

    const preferredPositions: Position[] = [];
    ['posa', 'posb', 'posc', 'posd'].forEach((key) => {
      const pos = parsePosition(get(col(key)));
      if (pos) preferredPositions.push(pos);
    });

    const emailVal = get(col('email')).trim();
    rows.push({
      name,
      number: get(col('number')),
      email: emailVal || undefined,
      bats: parseHandedness(get(col('bats'))),
      throws: parseThrows(get(col('throws'))),
      preferredPositions: preferredPositions.length > 0 ? preferredPositions : undefined,
      battingAverage: parseStat(get(col('avg'))),
      obp: parseStat(get(col('obp'))),
      era: parseStat(get(col('era'))),
    });
  }

  return { rows, errors };
}

export const CSV_TEMPLATE_HEADERS =
  'Name,Number,Email,Bats,Throws,Pos A,Pos B,Pos C,Pos D,AVG,OBP,ERA';

export const CSV_TEMPLATE_EXAMPLE =
`Name,Number,Email,Bats,Throws,Pos A,Pos B,Pos C,Pos D,AVG,OBP,ERA
Alex Rivera,7,alex@example.com,R,R,SS,2B,3B,,0.285,0.340,
Jordan Lee,12,jordan@example.com,L,R,P,CF,,,0.310,0.380,2.45
Sam Torres,22,,S,R,2B,SS,3B,1B,0.265,0.330,
Casey Morgan,4,casey@example.com,R,R,CF,LF,RF,,0.290,0.355,
Morgan Kim,18,,L,L,P,1B,,,0.220,0.295,3.10
Riley Davis,31,riley@example.com,R,R,C,1B,3B,,0.245,0.310,
Jamie Patel,9,,R,R,1B,3B,,,0.300,0.370,
Taylor Brooks,5,,S,R,LF,CF,RF,,0.275,0.340,
Drew Nguyen,15,drew@example.com,R,R,3B,SS,2B,,0.255,0.320,
Quinn Okafor,2,,L,L,RF,LF,CF,,0.285,0.350,`;
