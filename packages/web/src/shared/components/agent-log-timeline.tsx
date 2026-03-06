import type { AgentLogEntry } from '@sage/shared';

export function AgentLogTimeline({ entries }: { entries: AgentLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No agent log entries.</p>;
  }

  return (
    <div className="space-y-4">
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-sm font-medium">
              {entry.step}
            </div>
            {i < entries.length - 1 && <div className="w-px grow bg-border" />}
          </div>
          <div className="pb-4 pt-1">
            <p className="text-sm font-medium">{entry.action}</p>
            <p className="mt-1 text-xs text-muted-foreground">{entry.reasoning}</p>
            <p className="mt-1 text-xs">→ {entry.outcome}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(entry.durationMs / 1000).toFixed(1)}s
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
