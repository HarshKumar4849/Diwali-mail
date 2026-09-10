"use client";

export function ProgressBar({
  sent,
  total,
  failed = 0,
}: {
  sent: number;
  total: number;
  failed?: number;
}) {
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">
          <strong className="text-foreground font-semibold tabular-nums">{sent}</strong> of <span className="tabular-nums">{total}</span> delivered
          {failed > 0 && <span className="text-rose-600 dark:text-rose-400 ml-1 font-semibold tabular-nums">({failed} failed)</span>}
        </span>
        <span className="font-bold text-primary font-mono tabular-nums text-xs sm:text-sm">{pct}%</span>
      </div>
      <div className="w-full bg-muted/70 rounded-full h-2.5 overflow-hidden p-0.5 border border-border/60 shadow-2xs">
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-500 ease-out shadow-xs"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
