import Link from "next/link";
import { QuickVoiceLogo } from "@/components/quickvoice-logo";

const links = [
  { href: "#overview", label: "Overview" },
  { href: "#features", label: "Features" },
  { href: "#architecture", label: "Architecture" },
  { href: "#setup", label: "Setup" },
  { href: "#clients", label: "Clients" },
  { href: "#faq", label: "FAQ" },
];

export function McpPageNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--qv-border)] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link className="flex items-center gap-3 font-semibold tracking-tight text-slate-950" href="/">
          <QuickVoiceLogo compact />
        </Link>
        <nav aria-label="MCP page sections" className="hidden items-center gap-1 rounded-full border border-[var(--qv-border)] bg-white p-1 text-sm shadow-sm md:flex">
          {links.map((link) => (
            <a key={link.href} className="rounded-full px-3 py-2 font-medium text-slate-600 transition hover:bg-[var(--qv-bg-muted)] hover:text-[var(--qv-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--qv-blue)]/25" href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <Link className="inline-flex min-h-10 items-center rounded-full bg-[var(--qv-blue)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--qv-blue-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--qv-blue)]/30" href="/api-reference">
          API docs
        </Link>
      </div>
    </header>
  );
}
