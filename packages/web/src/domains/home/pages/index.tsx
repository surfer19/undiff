export function IndexPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">Sage</h1>
      <p className="text-muted-foreground">Multi-Agent Solution Explorer for Code Review</p>
      <p className="text-sm text-muted-foreground">
        Navigate to <code className="rounded bg-muted px-1 py-0.5">/explore/:runId</code> to view an
        exploration run.
      </p>
    </div>
  );
}
