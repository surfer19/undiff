import { Badge } from '@/shared/components/ui/badge';
import type { RiskLevel } from '@sage/shared';

const riskConfig: Record<
  RiskLevel,
  { emoji: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  low: { emoji: '🟢', variant: 'success' },
  medium: { emoji: '🟡', variant: 'warning' },
  high: { emoji: '🔴', variant: 'destructive' },
};

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const config = riskConfig[risk];
  return (
    <Badge variant={config.variant}>
      {config.emoji} {risk}
    </Badge>
  );
}
