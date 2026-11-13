// Parse CSV text into rows of fields.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const end = () => { row.push(field); field = ''; if (row.some(v => v.trim() !== '')) rows.push(row); row = []; };
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; end(); }
    else field += c;
  }
  if (field !== '' || row.length) end();
  return rows;
}

// Parse CSV text into objects keyed by the header row.
export function csvTable(rows) {
  const [header, ...body] = rows;
  return body.map(r => Object.fromEntries(header.map((k, i) => [k.trim(), r[i]])));
}
