import { Link } from '@tanstack/react-router';
import { StatusBadge } from '@/shared/components/status-badge';
import { RiskBadge } from '@/shared/components/risk-badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import type { ExplorationOption, SolutionBranchStatus } from '@sage/shared';

interface OptionCardProps {
  option: ExplorationOption;
  branch?: { id: string; optionId: string; status: SolutionBranchStatus };
  runId: string;
}

export function OptionCard({ option, branch, runId }: OptionCardProps) {
  const content = (
    <Card className={branch ? 'cursor-pointer transition-colors hover:border-primary/50' : ''}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {option.id}
          </Badge>
          <CardTitle className="text-base">{option.label}</CardTitle>
          {option.isPreferred && <Badge variant="default">★ Preferred</Badge>}
          <RiskBadge risk={option.estimatedImpact.riskLevel} />
          {branch && <StatusBadge status={branch.status} />}
        </div>
        <CardDescription>{option.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Files: {option.estimatedImpact.filesChanged}</span>
          <span>
            Complexity: {option.estimatedImpact.complexityDelta >= 0 ? '+' : ''}
            {option.estimatedImpact.complexityDelta}
          </span>
        </div>
      </CardContent>
    </Card>
  );

  if (branch) {
    return (
      <Link
        to="/explore/$runId/branch/$branchId"
        params={{ runId, branchId: branch.id }}
        className="block no-underline"
      >
        {content}
      </Link>
    );
  }

  return content;
}
