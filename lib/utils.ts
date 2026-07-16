import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  values.push(current.trim());
  return values;
}

export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]).filter(Boolean).map(h => h.trim());
  if (headers.length === 0) return { headers: [], rows: [] };
  const rows = lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i]?.trim() || ''; });
    return row;
  });
  return { headers, rows };
}

export function parseExcel(file: File): Promise<{ headers: string[]; rows: Record<string, string>[]; fileName: string }> {
  return new Promise(async (resolve, reject) => {
    const XLSX = await import("xlsx");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
        if (json.length === 0) return resolve({ headers: [], rows: [], fileName: file.name });
        const headers = Object.keys(json[0]).map(h => h.trim());
        const trimmedRows = json.map(row => {
          const trimmed: Record<string, string> = {};
          for (const [key, val] of Object.entries(row)) {
            trimmed[key.trim()] = val;
          }
          return trimmed;
        });
        resolve({ headers, rows: trimmedRows, fileName: file.name });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}
