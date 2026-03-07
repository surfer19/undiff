import { Badge } from '@/shared/components/ui/badge';
import type { ExploreRunStatus, SolutionBranchStatus } from '@sage/shared';

const statusConfig: Record<
  string,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning';
  }
> = {
  pending: { label: 'Pending', variant: 'secondary' },
  analyzing: { label: 'Analyzing', variant: 'default' },
  options_ready: { label: 'Options Ready', variant: 'success' },
  running: { label: 'Running', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
  generating: { label: 'Generating', variant: 'default' },
  sandbox_running: { label: 'Sandbox Running', variant: 'warning' },
};

export function StatusBadge({ status }: { status: ExploreRunStatus | SolutionBranchStatus }) {
  const config = statusConfig[status] ?? {
    label: status,
    variant: 'secondary' as const,
  };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
