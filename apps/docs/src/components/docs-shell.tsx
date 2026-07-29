import Link from "next/link";
import { QuickVoiceLogo } from "@/components/quickvoice-logo";
import { docsNav } from "@/lib/docs-nav";

export function DocsShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-[var(--qv-bg)] text-[var(--qv-ink)]">
      <header className="sticky top-0 z-40 border-b border-[var(--qv-border)] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link className="flex items-center gap-3 font-semibold tracking-tight" href="/">
            <QuickVoiceLogo label="QuickVoice Docs" compact />
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-[var(--qv-muted)] md:flex">
            <Link className="transition hover:text-[var(--qv-ink)]" href="/api-reference">API Reference</Link>
            <Link className="transition hover:text-[var(--qv-ink)]" href="/mcp/tools">Tools</Link>
            <Link className="transition hover:text-[var(--qv-ink)]" href="/mcp/resources">Resources</Link>
            <Link className="rounded-lg border border-[var(--qv-border)] px-3 py-1.5 font-medium text-[var(--qv-ink)] transition hover:border-[var(--qv-blue)] hover:text-[var(--qv-blue)]" href="/mcp/quickstart">Quickstart</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-56px)] border-r border-[var(--qv-border)] bg-[var(--qv-bg-muted)]/55 px-5 py-7 lg:block">
          <div className="sticky top-20 space-y-8">
            {docsNav.map((group) => (
              <section key={group.title}>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{group.title}</h2>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <Link key={item.href} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-white hover:text-[var(--qv-blue)] hover:shadow-sm" href={item.href}>
                      {item.title}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>
        <main className="min-w-0 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
