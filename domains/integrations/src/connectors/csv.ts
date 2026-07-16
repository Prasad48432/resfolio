/**
 * Minimal RFC-4180 CSV parsing for `file`-mode connectors (doc 12). LinkedIn
 * exports quote fields that contain commas, quotes, or newlines, so a naive
 * `split(",")` is not an option. Dependency-free and pure — unit-tested
 * against real export shapes.
 */

/** Parse CSV text into rows of fields. Handles quoted fields, escaped quotes
 * (`""`), embedded commas/newlines, and CRLF/LF line endings. A UTF-8 BOM is
 * stripped. Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAny = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // A row of nothing but empty fields is a blank line — skip it.
    if (row.some((value) => value.length > 0)) {
      rows.push(row);
    }
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] as string;
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field.length === 0) {
      inQuotes = true;
      sawAny = true;
      continue;
    }
    if (char === ",") {
      pushField();
      sawAny = true;
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") {
        i += 1;
      }
      pushRow();
      continue;
    }
    field += char;
    sawAny = true;
  }
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }
  return sawAny ? rows : [];
}

/** Parse CSV text whose first row is a header into one object per record,
 * keyed by the (trimmed) header names. Short rows leave keys empty. */
export function csvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) {
    return [];
  }
  const keys = header.map((name) => name.trim());
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    keys.forEach((key, index) => {
      if (key) {
        record[key] = (row[index] ?? "").trim();
      }
    });
    return record;
  });
}
