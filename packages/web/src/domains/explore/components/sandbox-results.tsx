import { Card, CardContent } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import type { SandboxResult } from '@sage/shared';

export function SandboxResults({ sandbox }: { sandbox: SandboxResult }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Sandbox Results</h2>
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Build: </span>
              <Badge
                variant={
                  sandbox.buildStatus === 'passed'
                    ? 'success'
                    : sandbox.buildStatus === 'failed'
                      ? 'destructive'
                      : 'secondary'
                }
              >
                {sandbox.buildStatus}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Tests: </span>
              <span className="font-medium">
                {sandbox.testResults.passed}/{sandbox.testResults.total} passed
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Duration: </span>
              <span>{(sandbox.totalDurationMs / 1000).toFixed(1)}s</span>
            </div>
          </div>
          {sandbox.testResults.failedNames.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-muted-foreground">Failed tests:</p>
              <div className="flex flex-wrap gap-1">
                {sandbox.testResults.failedNames.map((name) => (
                  <Badge key={name} variant="destructive" className="text-xs">
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
