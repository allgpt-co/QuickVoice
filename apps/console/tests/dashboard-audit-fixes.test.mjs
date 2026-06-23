import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");

test("dashboard exposes freshness, reporting window, and stale/offline state", () => {
  const page = read("src/app/(app)/dashboard/page.tsx");
  const freshness = read("src/components/dashboard/DashboardFreshness.tsx");

  assert.match(page, /DashboardFreshness/);
  assert.match(page, /dataUpdatedAt/);
  assert.match(page, /isStale/);
  assert.match(page, /isFetching/);

  assert.match(freshness, /Reporting window/);
  assert.match(freshness, /Last updated/);
  assert.match(freshness, /Refresh dashboard/);
  assert.match(freshness, /aria-busy=\{isFetching\}/);
  assert.match(freshness, /navigator\.onLine/);
  assert.match(freshness, /You are offline/);
  assert.match(freshness, /Dashboard data is stale/);
  assert.match(freshness, /summary\.period\.from/);
  assert.match(freshness, /summary\.period\.to/);
});

test("dashboard KPI deltas use unit-aware copy and a named previous period", () => {
  const source = read("src/components/dashboard/KpiCards.tsx");

  assert.doesNotMatch(source, /suffix = "%"/);
  assert.doesNotMatch(source, /vs previous/);
  assert.match(source, /formatPreviousPeriodLabel/);
  assert.match(source, /previousPeriodLabel/);
  assert.match(source, /summary\.period\.previousFrom/);
  assert.match(source, /summary\.period\.previousTo/);
  assert.match(source, /unit="call"/);
  assert.match(source, /unit="minute"/);
  assert.match(source, /unit="second"/);
  assert.match(source, /unit="percentage point"/);
  assert.match(source, /comparisonLabel=\{previousPeriodLabel\}/);
});

test("dashboard exception signals link to filtered calls views with range context", () => {
  const page = read("src/app/(app)/dashboard/page.tsx");
  const kpis = read("src/components/dashboard/KpiCards.tsx");
  const breakdown = read("src/components/dashboard/BreakdownCharts.tsx");
  const agents = read("src/components/dashboard/AgentActivityList.tsx");
  const helperPath = "src/components/dashboard/call-filter-links.ts";

  assert.ok(
    existsSync(join(root, helperPath)),
    "dashboard call filter link helper should exist"
  );
  const helper = read(helperPath);

  assert.match(helper, /new URLSearchParams/);
  assert.match(helper, /params\.set\("range", range\)/);
  assert.match(helper, /params\.set\("status", status\)/);
  assert.match(helper, /params\.set\("agentId", agentId\)/);
  assert.match(helper, /return `\/calls\?\$\{params\.toString\(\)\}`/);

  assert.match(page, /<KpiCards[\s\S]*range=\{range\}/);
  assert.match(page, /<AgentActivityList[\s\S]*range=\{range\}/);
  assert.match(page, /<BreakdownCharts[\s\S]*range=\{range\}/);

  assert.match(kpis, /dashboardCallsHref/);
  assert.match(kpis, /status:\s*"FAILED"/);
  assert.match(kpis, /status:\s*"NOT_ANSWERED"/);
  assert.match(kpis, /Review failed calls/);
  assert.match(kpis, /View missed calls/);

  assert.match(breakdown, /dashboardCallsHref/);
  assert.match(breakdown, /status:\s*item\.status/);
  assert.match(breakdown, /Review/);

  assert.match(agents, /dashboardCallsHref/);
  assert.match(agents, /agentId:\s*agent\.agentId/);
  assert.match(agents, /View calls/);
});

test("dashboard charts expose accessible summaries, unit labels, and data tables", () => {
  const volume = read("src/components/dashboard/VolumeChart.tsx");
  const breakdown = read("src/components/dashboard/BreakdownCharts.tsx");

  for (const source of [volume, breakdown]) {
    assert.match(source, /accessibilityLayer/);
    assert.match(source, /aria-label=/);
    assert.match(source, /<table/);
    assert.match(source, /<caption/);
    assert.match(source, /<thead/);
    assert.match(source, /<tbody/);
    assert.match(source, /sr-only/);
  }

  assert.match(volume, /Calls by/);
  assert.match(volume, /Minutes \(right axis\)/);
  assert.match(volume, /Failed calls/);
  assert.match(volume, /aria-describedby=\{summaryId\}/);

  assert.match(breakdown, /aria-label="Call outcome status breakdown chart"/);
  assert.match(breakdown, /aria-label="Inbound and outbound direction mix chart"/);
  assert.match(breakdown, /statusPattern/);
  assert.match(breakdown, /directionPattern/);
  assert.match(breakdown, /Percentage of routed calls/);
});

test("dashboard range switching is labelled, responsive, and exposes loading state", () => {
  const page = read("src/app/(app)/dashboard/page.tsx");
  const source = read("src/components/dashboard/RangeSwitcher.tsx");

  assert.match(page, /<RangeSwitcher current=\{range\} loading=\{isFetching\}/);
  assert.match(source, /aria-label="Dashboard date range"/);
  assert.match(source, /aria-busy=\{busy\}/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Updating dashboard range/);
  assert.match(source, /w-full[^"]*sm:w-auto/);
  assert.match(source, /flex-1[^"]*sm:flex-none/);
});

test("dashboard recent calls use semantic table and list context", () => {
  const source = read("src/components/dashboard/RecentCallsTable.tsx");

  assert.match(source, /useAgents/);
  assert.match(source, /<Table/);
  assert.match(source, /<TableCaption/);
  assert.match(source, /<TableHeader/);
  assert.match(source, /<TableBody/);
  assert.match(source, /<ul/);
  assert.match(source, /<li/);

  assert.match(source, /formatAbsoluteTimestamp/);
  assert.match(source, /<time[\s\S]*dateTime=\{call\.startTime\}/);
  assert.doesNotMatch(source, /formatRelative/);

  assert.match(source, /caller/);
  assert.match(source, /callee/);
  assert.match(source, /agentLabel/);
  assert.match(source, /Agent name unavailable/);

  assert.match(source, /aria-label=\{`Open call \$\{call\.callId\}/);
  assert.match(source, /focus-visible:ring-2/);
  assert.match(source, /focus-visible:ring-offset-2/);
});

test("dashboard agent activity distinguishes agent lookup state from unassigned calls", () => {
  const source = read("src/components/dashboard/AgentActivityList.tsx");

  assert.match(source, /isLoading:\s*agentsLoading/);
  assert.match(source, /isError:\s*agentsError/);
  assert.match(source, /if \(!agent\.agentId\) return "Unassigned"/);
  assert.match(source, /if \(agentsLoading\) return "Resolving agent"/);
  assert.match(source, /if \(agentsError\) return "Agent name unavailable"/);
  assert.match(source, /Unknown agent/);
  assert.doesNotMatch(
    source,
    /agents\?\.find\(\(agent\) => agent\.agentId === id\)\?\.name \?\? "Unassigned"/
  );
});

test("dashboard empty and failure states cover permission, offline, partial data, and setup guidance", () => {
  const page = read("src/app/(app)/dashboard/page.tsx");
  const volume = read("src/components/dashboard/VolumeChart.tsx");
  const breakdown = read("src/components/dashboard/BreakdownCharts.tsx");
  const agents = read("src/components/dashboard/AgentActivityList.tsx");
  const recent = read("src/components/dashboard/RecentCallsTable.tsx");

  assert.match(page, /PermissionState/);
  assert.match(page, /OfflineState/);
  assert.match(page, /isPermissionError/);
  assert.match(page, /status === 403/);
  assert.match(page, /navigator\.onLine/);
  assert.match(page, /Partial dashboard data/);
  assert.match(page, /getMissingDashboardSections/);
  assert.match(page, /Review call logs/);

  assert.match(volume, /No calls yet in this range/);
  assert.match(volume, /Place a test call/);
  assert.match(volume, /Connect number/);

  assert.match(breakdown, /No outcomes yet/);
  assert.match(breakdown, /No routing data yet/);
  assert.match(breakdown, /Place a test call/);
  assert.match(breakdown, /Connect a number/);

  assert.match(agents, /Partial agent data/);
  assert.match(agents, /Create agent/);
  assert.match(agents, /Connect number/);

  assert.match(recent, /Partial call log data/);
  assert.match(recent, /Start with a test call/);
  assert.match(recent, /Connect number/);
});
