import { getRouteApi, Link } from '@tanstack/react-router';
import { useExploreBranches } from '@/domains/explore/api/explore.queries';
import { SandboxResults } from '@/domains/explore/components/sandbox-results';
import { StatusBadge } from '@/shared/components/status-badge';
import { RiskBadge } from '@/shared/components/risk-badge';
import { AgentLogTimeline } from '@/shared/components/agent-log-timeline';
import { CodeBlock } from '@/shared/components/code-block';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { ArrowLeft, Check, X } from 'lucide-react';

const routeApi = getRouteApi('/explore/$runId/branch/$branchId');

export function SolutionDetail() {
  const { runId, branchId } = routeApi.useParams();

  const { data: branches = [], isLoading } = useExploreBranches(runId);

  const branch = branches.find((b) => b.id === branchId);

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="p-6">
        <p className="text-destructive">Branch not found</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      {/* Back link */}
      <Link
        to="/explore/$runId"
        params={{ runId }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to run
      </Link>

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {branch.optionId}
          </Badge>
          <h1 className="text-2xl font-bold">{branch.label}</h1>
        </div>
        <p className="mt-1 text-muted-foreground">{branch.description}</p>
        <div className="mt-3 flex items-center gap-2">
          <StatusBadge status={branch.status} />
          <RiskBadge risk={branch.risk} />
          <span className="text-xs text-muted-foreground">
            Complexity: {branch.complexityDelta >= 0 ? '+' : ''}
            {branch.complexityDelta} · Files: {branch.filesChanged.length}
          </span>
        </div>
      </div>

      {/* Code Changes */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Code Changes</h2>
        <CodeBlock code={branch.code} />
        {Object.keys(branch.newFiles).length > 0 && (
          <div className="mt-4 space-y-3">
            <h3 className="text-sm font-medium">New Files</h3>
            {Object.entries(branch.newFiles).map(([filePath, content]) => (
              <div key={filePath}>
                <p className="mb-1 font-mono text-xs text-muted-foreground">{filePath}</p>
                <CodeBlock code={content} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pros & Cons */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-success">Pros</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {branch.pros.map((pro, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {pro}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-destructive">Cons</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {branch.cons.map((con, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  {con}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Sandbox Results */}
      {branch.sandbox && <SandboxResults sandbox={branch.sandbox} />}

      {/* Agent Log */}
      {branch.agentLog.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Agent Log</h2>
          <AgentLogTimeline entries={branch.agentLog} />
        </section>
      )}

      {/* Files Changed */}
      {branch.filesChanged.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Files Changed</h2>
          <div className="flex flex-wrap gap-2">
            {branch.filesChanged.map((f) => (
              <Badge key={f} variant="outline" className="font-mono text-xs">
                {f}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
