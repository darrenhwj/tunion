/**
 * Strict RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF/LF, UTF-8 BOM. No dependencies.
 * Malformed input throws instead of being "repaired": a quote inside an unquoted field, text after a closing quote,
 * and an unterminated quoted field are all errors (with the 1-based line number).
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false; // just saw the closing quote of a quoted field
  let line = 1;
  const fail = (why: string): never => { throw new Error(`Malformed CSV on line ${line}: ${why}`); };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; }
      } else { if (ch === '\n') line++; field += ch; }
    } else if (ch === ',') { row.push(field); field = ''; closed = false; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = ''; closed = false;
      rows.push(row); row = [];
      line++;
    } else if (closed) fail('text after the closing quote of a field');
    else if (ch === '"') {
      if (field === '') quoted = true;
      else fail('a quote inside an unquoted field (quote the whole field and double any inner quotes)');
    } else field += ch;
  }
  if (quoted) fail('unterminated quoted field');
  if (field !== '' || closed || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface CsvRecord { row: number; v: Record<string, string> }

/**
 * Parses CSV into objects keyed by lower-cased header. Rejects missing required headers and any record whose column
 * count differs from the header (e.g. an unquoted comma in a description) - such records are never re-assembled.
 * Record numbers are 1-based, counting the header as record 1.
 */
export function parseCsvObjects(
  text: string,
  required: readonly string[],
): { rows: CsvRecord[]; errors: string[]; header: string[] } {
  const errors: string[] = [];
  let table: string[][];
  try { table = parseCsv(text); } catch (e) { return { rows: [], errors: [(e as Error).message], header: [] }; }
  if (table.length === 0) return { rows: [], errors: ['File is empty'], header: [] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = required.filter((h) => !header.includes(h));
  if (missing.length) errors.push(`Missing column(s): ${missing.join(', ')}`);
  const rows: CsvRecord[] = [];
  table.slice(1).forEach((cells, i) => {
    if (cells.length !== header.length) {
      const id = cells[0]?.trim() ? ` (starts with "${cells[0].trim()}")` : '';
      errors.push(`Row ${i + 2}${id}: expected ${header.length} columns, found ${cells.length}. Rejected; if a field contains commas, wrap it in double quotes`);
      return;
    }
    rows.push({ row: i + 2, v: Object.fromEntries(header.map((h, c) => [h, cells[c].trim()])) });
  });
  return { rows, errors, header };
}
