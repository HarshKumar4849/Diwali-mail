"use client";

import { Recipient } from "@/types";

const statusColors: Record<string, string> = {
  pending: "text-yellow-600",
  sent: "text-green-600",
  failed: "text-red-600",
};

export function RecipientTable({ recipients }: { recipients: Recipient[] }) {
  return (
    <div className="max-h-96 overflow-y-auto border rounded">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted">
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Sent At</th>
            <th className="p-2 text-left">Error</th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2">{r.email}</td>
              <td className={`p-2 font-medium ${statusColors[r.status]}`}>{r.status}</td>
              <td className="p-2">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "-"}</td>
              <td className="p-2 text-red-600 text-xs">{r.error_message || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
