"use client";

export function ProgressBar({ sent, total }: { sent: number; total: number }) {
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{sent} of {total} sent</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full bg-muted rounded-full h-3">
        <div className="bg-primary h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
