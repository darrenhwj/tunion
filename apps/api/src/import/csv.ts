/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF/LF, UTF-8 BOM. No dependencies. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (quoted) throw new Error('Unterminated quoted field');
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Parses CSV into objects keyed by header. Rejects missing required headers and ragged rows. Row numbers are 1-based file lines of data. */
export function parseCsvObjects(
  text: string,
  required: readonly string[],
  opts: { rejoinLastColumn?: boolean } = {},
): { rows: Record<string, string>[]; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  let table: string[][];
  try { table = parseCsv(text); } catch (e) { return { rows: [], errors: [(e as Error).message], warnings }; }
  if (table.length === 0) return { rows: [], errors: ['File is empty'], warnings };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = required.filter((h) => !header.includes(h));
  if (missing.length) errors.push(`Missing column(s): ${missing.join(', ')}`);
  const rows = table.slice(1).map((cells0, i) => {
    let cells = cells0;
    if (opts.rejoinLastColumn && cells.length > header.length) {
      // Unquoted commas in the final free-text column: re-join the overflow into it.
      warnings.push(`Row ${i + 2}: ${cells.length - header.length} extra comma(s) in the last column (unquoted text); re-joined into "${header[header.length - 1]}"`);
      cells = [...cells.slice(0, header.length - 1), cells.slice(header.length - 1).join(',')];
    }
    if (cells.length !== header.length) errors.push(`Row ${i + 2}: expected ${header.length} columns, found ${cells.length}`);
    return Object.fromEntries(header.map((h, c) => [h, (cells[c] ?? '').trim()]));
  });
  return { rows, errors, warnings };
}
