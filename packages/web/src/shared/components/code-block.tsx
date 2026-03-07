import { cn } from '@/shared/lib/utils';

export function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <pre
      className={cn(
        'overflow-x-auto rounded-lg border border-border bg-muted p-4 text-sm',
        className,
      )}
    >
      <code>{code}</code>
    </pre>
  );
}
