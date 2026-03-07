import { getRouteApi } from '@tanstack/react-router';
import { useExploreRun, useExploreBranches } from '@/domains/explore/api/explore.queries';
import { OptionCard } from '@/domains/explore/components/option-card';
import { StatusBadge } from '@/shared/components/status-badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/shared/components/ui/card';

const routeApi = getRouteApi('/explore/$runId');

export function RunOverview() {
  const { runId } = routeApi.useParams();

  const { data: run, isLoading: runLoading, error: runError } = useExploreRun(runId);

  const { data: branches = [] } = useExploreBranches(runId, {
    enabled: !!run && (run.status === 'completed' || run.status === 'running'),
  });

  if (runLoading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (runError || !run) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-destructive">Run not found</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Explore Run</h1>
        <p className="font-mono text-sm text-muted-foreground">{run.id}</p>
      </div>

      {/* Run Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <StatusBadge status={run.status} />
            <CardTitle className="text-lg">{run.filePath}</CardTitle>
          </div>
          <CardDescription>
            {run.prRef.owner}/{run.prRef.repo}#{run.prRef.number} · Lines {run.lineRange.start}–
            {run.lineRange.end}
          </CardDescription>
        </CardHeader>
        {run.prompt && (
          <CardContent>
            <p className="text-sm italic">&ldquo;{run.prompt}&rdquo;</p>
          </CardContent>
        )}
      </Card>

      {/* Options */}
      {run.options.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Options</h2>
          <div className="grid gap-4">
            {run.options.map((option) => {
              const branch = branches.find((b) => b.optionId === option.id);
              return <OptionCard key={option.id} option={option} branch={branch} runId={runId} />;
            })}
          </div>
        </section>
      )}
    </div>
  );
}
