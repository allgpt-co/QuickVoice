import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  KeyRound,
  Server,
  ShieldCheck,
} from "lucide-react";
import { McpCopyButton } from "@/components/mcp/mcp-copy-button";
import {
  apiAuthNotes,
  apiBaseUrl,
  apiEndpointCount,
  apiGroups,
  sampleAgentCreate,
  sampleCurl,
  sampleResponse,
  type ApiEndpoint,
  type ApiMethod,
} from "@/data/api-reference";

const methodClass: Record<ApiMethod, string> = {
  GET: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  POST: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  PATCH: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  DELETE: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  OPTIONS: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

export function ApiReference() {
  return (
    <main className="api-reference-surface min-h-screen bg-[#070a12] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(0,47,167,0.28),transparent_32rem),radial-gradient(circle_at_85%_20%,rgba(14,165,233,0.12),transparent_28rem)]" />
      <div className="relative mx-auto grid max-w-[1500px] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden min-h-dvh border-r border-white/10 bg-[#090d16]/80 px-5 py-6 backdrop-blur-xl lg:block">
          <div className="sticky top-6">
            <Link className="flex items-center gap-3" href="/">
              <span className="grid size-9 place-items-center rounded-xl bg-[#002FA7] text-sm font-bold text-white">
                QV
              </span>
              <span>
                <span className="block text-sm font-semibold">QuickVoice</span>
                <span className="text-xs text-slate-400">API Reference</span>
              </span>
            </Link>
            <nav className="mt-8 space-y-6" aria-label="API reference sections">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Overview
                </p>
                <div className="space-y-1">
                  <NavItem href="#base-url" label="Base URL" />
                  <NavItem href="#authentication" label="Authentication" />
                  <NavItem href="#examples" label="Examples" />
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Endpoints
                </p>
                <div className="max-h-[58vh] space-y-1 overflow-y-auto pr-1">
                  {apiGroups.map((group) => (
                    <NavItem
                      key={group.slug}
                      href={`#${group.slug}`}
                      label={group.title}
                      count={group.endpoints.length}
                    />
                  ))}
                </div>
              </div>
            </nav>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
          <header className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 sm:p-8">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
              <BookOpen aria-hidden="true" className="size-4" />
              API Documentation
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
              <div>
                <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-6xl">
                  QuickVoice REST API reference
                </h1>
                <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
                  Production endpoint documentation generated from the Express
                  route modules. Use it to integrate agents, calls, numbers,
                  tools, widgets, MCP integrations, and operational data.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                <Metric label="Base" value="/api/v1" />
                <Metric label="Groups" value={String(apiGroups.length)} />
                <Metric label="Endpoints" value={String(apiEndpointCount)} />
                <Metric label="Auth" value="Bearer" />
              </div>
            </div>
          </header>

          <section id="base-url" className="scroll-mt-8 pt-10">
            <SectionTitle
              icon={Server}
              eyebrow="Base URL"
              title="Route prefix"
              description="All product API routes are registered under the configured API version prefix."
            />
            <CopyPanel value={apiBaseUrl} language="text" />
          </section>

          <section id="authentication" className="scroll-mt-8 pt-10">
            <SectionTitle
              icon={ShieldCheck}
              eyebrow="Authentication"
              title="Access model"
              description="QuickVoice validates each request before applying route-level permissions."
            />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <ul className="space-y-3 text-sm leading-6 text-slate-300">
                  {apiAuthNotes.map((note) => (
                    <li key={note} className="flex gap-3">
                      <CheckCircle2
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-emerald-300"
                      />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <CopyPanel
                value="x-api-key: YOUR_QUICKVOICE_API_KEY"
                language="http"
                compact
              />
            </div>
          </section>

          <section id="examples" className="scroll-mt-8 pt-10">
            <SectionTitle
              icon={KeyRound}
              eyebrow="Examples"
              title="Request and response shape"
              description="Most protected endpoints return the same success/message/data envelope; list endpoints may also include nextCursor."
            />
            <div className="grid gap-4 xl:grid-cols-3">
              <CopyPanel value={sampleCurl} language="bash" />
              <CopyPanel value={sampleAgentCreate} language="bash" />
              <CopyPanel value={sampleResponse} language="json" />
            </div>
          </section>

          <div className="pt-10">
            {apiGroups.map((group) => (
              <section
                key={group.slug}
                id={group.slug}
                className="scroll-mt-8 border-t border-white/10 py-9"
              >
                <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">
                      {group.endpoints.length} endpoints
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-white">
                      {group.title}
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                      {group.description}
                    </p>
                  </div>
                  <a
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-4 text-sm font-semibold text-slate-200 transition hover:border-sky-400/50 hover:text-white"
                    href={`#${group.slug}`}
                  >
                    Copy section link{" "}
                    <ArrowUpRight aria-hidden="true" className="size-4" />
                  </a>
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c111d]">
                  {group.endpoints.map((endpointItem) => (
                    <EndpointRow
                      key={`${endpointItem.method}-${endpointItem.path}`}
                      endpoint={endpointItem}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function NavItem({
  href,
  label,
  count,
}: Readonly<{ href: string; label: string; count?: number }>) {
  return (
    <a
      className="flex min-h-9 items-center justify-between rounded-xl px-3 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-400/60"
      href={href}
    >
      <span>{label}</span>
      {typeof count === "number" ? (
        <span className="text-xs text-slate-600">{count}</span>
      ) : null}
    </a>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 font-mono text-2xl font-semibold text-white">
        {value}
      </p>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  eyebrow,
  title,
  description,
}: Readonly<{
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
}>) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-white">
          {title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          {description}
        </p>
      </div>
    </div>
  );
}

function CopyPanel({
  value,
  language,
  compact = false,
}: Readonly<{ value: string; language: string; compact?: boolean }>) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] shadow-xl shadow-black/20">
      <figcaption className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
          {language}
        </span>
        <McpCopyButton value={value} label="Copy" />
      </figcaption>
      <pre
        className={`${compact ? "p-4" : "p-5"} overflow-x-auto text-sm leading-7 text-slate-100`}
      >
        <code>{value}</code>
      </pre>
    </figure>
  );
}

function EndpointRow({ endpoint }: Readonly<{ endpoint: ApiEndpoint }>) {
  return (
    <details className="group border-b border-white/10 last:border-b-0">
      <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 transition hover:bg-white/[0.035] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 inline-flex min-w-16 justify-center rounded-full border px-2.5 py-1 font-mono text-xs font-bold ${methodClass[endpoint.method]}`}
          >
            {endpoint.method}
          </span>
          <div className="min-w-0">
            <p className="break-all font-mono text-sm font-semibold text-slate-100">
              {endpoint.path}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              {endpoint.summary}
            </p>
          </div>
        </div>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-slate-500 transition group-open:rotate-180"
        />
      </summary>
      <div className="grid gap-4 border-t border-white/10 bg-black/20 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 md:grid-cols-2">
          <InfoBlock label="Authentication" values={[endpoint.auth]} />
          <InfoBlock
            label="Permission"
            values={[endpoint.permission ?? "Not permission-gated"]}
          />
          {endpoint.params ? (
            <InfoBlock label="Path parameters" values={endpoint.params} />
          ) : null}
          {endpoint.query ? (
            <InfoBlock label="Query parameters" values={endpoint.query} />
          ) : null}
          {endpoint.body ? (
            <InfoBlock label="Request body" values={endpoint.body} />
          ) : null}
          <InfoBlock label="Response" values={[endpoint.response]} />
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#070a12] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Source
          </p>
          <p className="mt-3 break-all font-mono text-xs leading-5 text-slate-300">
            {endpoint.source}
          </p>
          <p className="mt-5 text-xs leading-5 text-slate-500">
            This reference entry is based on the registered Express route and
            matching Zod/controller code.
          </p>
        </div>
      </div>
    </details>
  );
}

function InfoBlock({
  label,
  values,
}: Readonly<{ label: string; values: string[] }>) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
        {values.map((value) => (
          <li key={value} className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky-300" />
            <span>{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
