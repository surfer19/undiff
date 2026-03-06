import { Outlet, Link } from '@tanstack/react-router';

export function RootLayout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <Link to="/" className="text-lg font-semibold no-underline">
            🔮 Sage
          </Link>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
