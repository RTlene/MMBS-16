function stripBom(text) {
  if (!text) return '';
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Very small CSV generator (comma-separated, RFC4180-ish).
 * @param {string[]} headers
 * @param {Array<Array<any>>} rows
 */
function toCsv(headers, rows) {
  const escapeCell = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [];
  lines.push(headers.map(escapeCell).join(','));
  for (const row of rows) {
    lines.push((row || []).map(escapeCell).join(','));
  }
  return '\ufeff' + lines.join('\r\n');
}

/**
 * Simple CSV parser supporting quoted fields and commas/newlines.
 * Returns array of rows (each row array of strings).
 */
function parseCsv(text) {
  const input = stripBom(text || '');
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  while (i < input.length) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        const next = input[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (c === '\r') {
      if (input[i + 1] === '\n') i += 2;
      else i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (c === '\n') {
      i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += c;
    i += 1;
  }

  // flush last
  row.push(field);
  rows.push(row);

  // trim trailing empty rows
  while (rows.length && rows[rows.length - 1].every((x) => (x || '').trim() === '')) rows.pop();
  return rows;
}

function rowsToObjects(rows) {
  if (!rows || rows.length === 0) return [];
  const headers = rows[0].map((h) => (h || '').trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim();
    });
    return obj;
  });
}

module.exports = { toCsv, parseCsv, rowsToObjects };

