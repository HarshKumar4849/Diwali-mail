import type { FollowupContact } from "@/lib/followup/contacts";

export const FOLLOWUP_EXPORT_HEADERS = [
  "Contact Name",
  "Email",
  "Company",
  "Campaign",
  "Follow-up Status",
  "Last Activity",
  "Follow-up Date",
] as const;

export type FollowupExportRow = Record<string, string>;

/** Follow-up date = send date + configured follow-up interval. */
export function computeFollowupDate(sentAt: string | null | undefined, intervalDays: number): string {
  if (!sentAt) return "";
  const d = new Date(new Date(sentAt).getTime() + intervalDays * 86_400_000);
  return d.toISOString();
}

/** Last meaningful activity: latest of reply / bounce / send. */
export function computeLastActivity(c: FollowupContact): string {
  const last = [c.replyAt, c.bouncedAt, c.sentAt].filter(Boolean).sort(
    (a, b) => new Date(b!).getTime() - new Date(a!).getTime()
  );
  const latest = last[0];
  return latest ? new Date(latest).toISOString() : "";
}

/** Builds export rows from derived follow-up contacts + interval. */
export function buildFollowupExportRows(
  contacts: FollowupContact[],
  intervalDays: number
): FollowupExportRow[] {
  return contacts.map((c) => ({
    "Contact Name": c.name || "",
    Email: c.email || "",
    Company: c.company || "",
    Campaign: c.campaign || "",
    "Follow-up Status": c.status,
    "Last Activity": computeLastActivity(c),
    "Follow-up Date": computeFollowupDate(c.sentAt, intervalDays),
  }));
}

function escapeCsv(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toFollowupCsv(rows: FollowupExportRow[]): string {
  const lines = [FOLLOWUP_EXPORT_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(
      FOLLOWUP_EXPORT_HEADERS.map((h) => escapeCsv(row[h])).join(",")
    );
  }
  return lines.join("\n");
}

export async function generateFollowupXlsx(rows: FollowupExportRow[]): Promise<ArrayBuffer> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...FOLLOWUP_EXPORT_HEADERS] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Follow-ups");
  const content = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return content as ArrayBuffer;
}
