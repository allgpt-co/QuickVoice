import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");

test("organization creation stops on create failures and requires a returned id", () => {
  const source = read("src/components/forms/orgs/CreateOrg.tsx");

  assert.doesNotMatch(source, /router\.push\(`\/orgs\/\$\{data\?\.id\}`\)/);
  assert.match(source, /if \(!data\?\.id\)/);
  assert.doesNotMatch(source, /finally\s*\{[^}]*setError\(null\)/s);
});

test("phone number buying uses lower-case API provider values", () => {
  const source = read("src/components/numbers/BuyNumberDrawer.tsx");

  assert.match(source, /provider:\s*z\.enum\(\["twilio",\s*"telnyx"\]\)/);
  assert.doesNotMatch(source, /"TWILIO"|"TELNYX"/);
  assert.doesNotMatch(source, /as TelephonyProvider/);
});

test("roles page is wired to dynamic access-control CRUD", () => {
  const source = read("src/app/(app)/settings/roles/page.tsx");

  assert.doesNotMatch(
    source,
    /UI shell|follow-up|const\s+\[roles\]\s*=\s*useState<Role\[\]>\(\[\]\)/,
  );
  assert.match(source, /listRoles/);
  assert.match(source, /createRole/);
  assert.match(source, /updateRole/);
  assert.match(source, /deleteRole/);
});

test("data loading failures render retryable error states instead of empty data", () => {
  assert.match(read("src/app/(app)/dashboard/page.tsx"), /isError/);
  assert.match(read("src/app/(app)/dashboard/page.tsx"), /refetch/);
  assert.match(read("src/app/(app)/agents/page.tsx"), /isError/);
  assert.match(read("src/app/(app)/agents/page.tsx"), /refetch/);
  assert.match(read("src/components/calls/CallsTable.tsx"), /query\.isError/);
  assert.match(read("src/app/(app)/kb/page.tsx"), /isError/);
  assert.match(read("src/app/(app)/kb/page.tsx"), /refetch/);
});

test("call metadata sheet displays reason and non-primary metadata keys", () => {
  const source = read("src/components/calls/CallMetadataSheet.tsx");
  const detailPage = read("src/app/(app)/calls/[id]/page.tsx");
  const extractedPanel = read("src/components/calls/ExtractedDataPanel.tsx");

  assert.match(source, /PRIMARY_METADATA_KEYS/);
  assert.match(source, /"reason"/);
  assert.match(source, /Call Reason/);
  assert.match(source, /Additional Metadata/);
  assert.match(source, /formatMetadataLabel/);
  assert.match(source, /Object\.entries\(meta\)\.filter/);
  assert.match(detailPage, /metadata=\{call\.metadata\}/);
  assert.match(
    extractedPanel,
    /<h3 className="mb-3 text-sm font-semibold">Metadata<\/h3>/,
  );
  assert.match(extractedPanel, /No metadata captured for this call\./);
});

test("call filters convert dashboard ranges and calendar dates to API datetimes", () => {
  const page = read("src/app/(app)/calls/page.tsx");
  const filters = read("src/components/calls/CallFilters.tsx");
  const dates = read("src/lib/calls/date-filters.ts");

  assert.match(page, /resolveCallDateFilters/);
  assert.match(page, /range: sp\.get\("range"\)/);
  assert.match(filters, /Last 24 hours/);
  assert.match(filters, /next\.delete\("range"\)/);
  assert.match(dates, /toISOString/);
  assert.match(dates, /23, 59, 59, 999/);
});

test("billing displays real period usage with loading, overage, and retry states", () => {
  const page = read("src/app/(app)/settings/billing/page.tsx");
  const api = read("src/lib/api/resources/billing.ts");

  assert.match(page, /useBillingUsage/);
  assert.match(page, /usedMinutes/);
  assert.match(page, /overageMinutes/);
  assert.match(page, /usage\.refetch/);
  assert.doesNotMatch(page, /Usage telemetry is coming soon|TODO\(backend\)/);
  assert.match(api, /apiClient\.get\("\/billing\/usage"\)/);
});

test("form validation and external setup flows block unsafe or blank input", () => {
  assert.match(
    read("src/components/agents/tabs/WebhooksTab.tsx"),
    /superRefine/,
  );
  assert.match(
    read("src/components/tools/ToolSheet.tsx"),
    /key:\s*z\.string\(\)\.trim\(\)\.min\(1/,
  );
  assert.match(
    read("src/components/tools/ToolSheet.tsx"),
    /name:\s*z\.string\(\)\.trim\(\)\.min\(1/,
  );

  const mcpSource = read("src/hooks/queries/mcp.ts");
  assert.match(mcpSource, /isSafeSetupUrl/);
  assert.match(mcpSource, /noopener,noreferrer/);
  assert.doesNotMatch(mcpSource, /targetWindow\.opener/);
});

test("redacted integration secrets survive unrelated configuration edits", () => {
  const webhooks = read("src/components/agents/tabs/WebhooksTab.tsx");
  const toolSheet = read("src/components/tools/ToolSheet.tsx");
  const kvEditor = read("src/components/tools/KVEditor.tsx");

  assert.match(webhooks, /secretFieldsFromRows\(initiationHeaderRows\)/);
  assert.match(webhooks, /\.\.\.config\?\.post_call_webhook/);
  assert.match(toolSheet, /redacted:\s*z\.boolean\(\)\.optional\(\)/);
  assert.match(kvEditor, /redacted: false/);
  assert.match(kvEditor, /pair\.value \?\? ""/);
});

test("knowledge-base uploads enforce format, size, and signed content metadata", () => {
  const dialog = read("src/components/kb/UploadDialog.tsx");
  const api = read("src/lib/api/resources/kb.ts");

  assert.match(dialog, /MAX_UPLOAD_BYTES/);
  assert.match(dialog, /file\.size > MAX_UPLOAD_BYTES/);
  assert.match(dialog, /sourceType, contentType/);
  assert.match(api, /fileSize: number/);
  assert.match(api, /params: \{ fileName, contentType, fileSize \}/);
});

test("outbound batch uploads enforce size and signed content metadata", () => {
  const form = read("src/components/outbound/BatchCallForm.tsx");
  const api = read("src/lib/api/resources/outbound.ts");

  assert.match(form, /MAX_BATCH_UPLOAD_BYTES/);
  assert.match(form, /selected\.size > MAX_BATCH_UPLOAD_BYTES/);
  assert.match(form, /upload\.contentType/);
  assert.match(api, /fileSize: number/);
  assert.match(api, /params: \{ fileName, contentType, fileSize \}/);
});

test("knowledge-base failures expose progress, reasons, and retry controls", () => {
  const table = read("src/components/kb/KbTable.tsx");
  const hooks = read("src/hooks/queries/kb.ts");
  const api = read("src/lib/api/resources/kb.ts");

  assert.match(api, /`\/kb\/\$\{kbId\}\/retry`/);
  assert.match(hooks, /source\.status === "PROCESSING"/);
  assert.match(hooks, /2_000/);
  assert.match(table, /failureReason/);
  assert.match(table, /useRetryKb/);
  assert.match(table, /Retry/);
});

test("knowledge-base status details stay inside the desktop table column", () => {
  const table = read("src/components/kb/KbTable.tsx");
  const utils = read("src/components/kb/kb-utils.tsx");

  assert.match(
    table,
    /w-\[360px\] max-w-\[360px\] whitespace-normal align-top/,
  );
  assert.match(utils, /min-w-0 max-w-full space-y-2/);
  assert.match(utils, /break-words text-xs font-medium/);
  assert.match(utils, /break-words text-xs leading-5/);
  assert.match(utils, /break-all font-mono/);
});

test("auth registration and password reset flows have complete UX handling", () => {
  const register = read("src/components/forms/auth/register-form.tsx");

  assert.match(register, /finally/);
  assert.doesNotMatch(register, /console\.log/);
  assert.match(register, /disabled=\{loading\}/);
  assert.ok(existsSync(join(root, "src/app/(auth)/forgot-password/page.tsx")));
  assert.ok(existsSync(join(root, "src/app/(auth)/reset-password/page.tsx")));
});

test("google oauth redirects back to the canonical console origin", () => {
  const links =
    read("src/components/oauth-buttons.tsx") + read("src/lib/links.ts");
  const dollar = String.fromCharCode(36);

  assert.match(links, /NEXT_PUBLIC_CONSOLE_URL/);
  assert.match(links, /export const CONSOLE_URL/);
  assert.match(links, /CONSOLE_URL\s*\?\?/);
  assert.match(links, /callbackOrigin/);
  assert.ok(
    links.includes("callbackURL: `" + dollar + "{callbackOrigin}/dashboard`"),
  );
  assert.ok(
    links.includes("newUserCallbackURL: `" + dollar + "{callbackOrigin}/orgs`"),
  );
  assert.doesNotMatch(links, /callbackURL:\s*["'`]\/dashboard["'`]/);
});

test("agent creation, limits, and deletion are wired", () => {
  const agentsTable = read("src/components/agents/AgentsTable.tsx");
  assert.match(
    read("src/components/agents/NewAgentDialog.tsx"),
    /templateId:\s*selectedTemplate/,
  );
  assert.doesNotMatch(
    read("src/components/agents/NewAgentDialog.tsx"),
    /templateId:\s*null/,
  );
  assert.match(read("src/components/agents/AgentTabs.tsx"), /LimitsTab/);
  assert.match(read("src/lib/api/resources/agents.ts"), /remove:/);
  assert.match(read("src/hooks/queries/agents.ts"), /useDeleteAgent/);
  assert.match(agentsTable, /useDeleteAgent/);
  assert.match(agentsTable, /AgentPreviewPanel/);
  assert.doesNotMatch(
    agentsTable,
    /<DropdownMenuItem disabled[^>]*>\s*<FlaskConical/s,
  );
  assert.doesNotMatch(
    agentsTable,
    /<DropdownMenuItem disabled[^>]*>\s*<Trash2/s,
  );
  assert.match(read("src/app/(app)/agents/[id]/page.tsx"), /useDeleteAgent/);
});

test("settings organization supports confirmations, role reassignment, and invite management", () => {
  const source = read("src/app/(app)/settings/organization/page.tsx");

  assert.match(source, /AlertDialog/);
  assert.match(source, /updateMemberRole/);
  assert.match(source, /cancelInvitation/);
});

test("mobile and accessibility fixes are present", () => {
  assert.doesNotMatch(
    read("src/components/ui/sidebar.tsx"),
    /\[&>button\]:hidden/,
  );
  assert.match(
    read("src/components/shell/NavMain.tsx"),
    /setOpenMobile\(false\)/,
  );
  assert.match(
    read("src/components/agents/AgentsTable.tsx"),
    /overflow-x-auto/,
  );
  assert.match(read("src/components/calls/CallsTable.tsx"), /overflow-x-auto/);
  assert.match(read("src/components/kb/KbTable.tsx"), /overflow-x-auto/);
  assert.match(
    read("src/components/tools/ToolCard.tsx"),
    /aria-label="Tool actions"/,
  );
  assert.match(
    read("src/components/agents/tabs/ToolsTab.tsx"),
    /aria-label=\{`Detach/,
  );
});

test("dense data pages include mobile card views", () => {
  assert.match(read("src/components/agents/AgentsTable.tsx"), /md:hidden/);
  assert.match(read("src/components/calls/CallsTable.tsx"), /md:hidden/);
  assert.match(read("src/components/kb/KbTable.tsx"), /md:hidden/);
  assert.match(read("src/app/(app)/numbers/page.tsx"), /md:hidden/);
});

test("dense data tables avoid unsupported sort and bulk-selection affordances", () => {
  const tables = [
    read("src/components/agents/AgentsTable.tsx"),
    read("src/components/calls/CallsTable.tsx"),
    read("src/components/kb/KbTable.tsx"),
  ];

  for (const source of tables) {
    assert.doesNotMatch(source, /ArrowUpDown/);
    assert.doesNotMatch(source, /row\(s\) selected/);
    assert.doesNotMatch(source, /aria-label="Select row"/);
    assert.doesNotMatch(source, /aria-label="Select all"/);
  }
});

test("permission matrix exposes cell-specific checkbox names", () => {
  const source = read("src/components/settings/PermissionMatrix.tsx");

  assert.match(source, /aria-label=\{`Allow \$\{r\.label\} \$\{a\}`\}/);
});

test("agent advanced danger zone uses the supported delete flow", () => {
  const source = read("src/components/agents/tabs/AdvancedTab.tsx");

  assert.match(source, /useDeleteAgent/);
  assert.match(source, /router\.push\("\/agents"\)/);
  assert.doesNotMatch(source, /not yet supported/i);
  assert.doesNotMatch(
    source,
    /<AlertDialogAction disabled>Delete<\/AlertDialogAction>/,
  );
});

test("agent privacy controls are writable and enforce compatible settings", () => {
  const advanced = read("src/components/agents/tabs/AdvancedTab.tsx");
  const api = read("src/lib/api/resources/agents.ts");
  const defaults = read("src/lib/agents/config-defaults.ts");

  for (const field of [
    "store_call_audio",
    "zero_pii_retention",
    "conversation_retention_days",
  ]) {
    assert.match(advanced, new RegExp(field));
    assert.match(api, new RegExp(field));
    assert.match(defaults, new RegExp(field));
  }
  assert.match(advanced, /form\.setValue\("store_call_audio", false/);
  assert.match(advanced, /max=\{3650\}/);
});

test("sidebar exposes a direct theme toggle and transcript bubbles keep readable contrast", () => {
  const sidebar = read("src/components/shell/AppSidebar.tsx");
  const transcript = read("src/components/calls/Transcript.tsx");

  assert.match(sidebar, /useTheme/);
  assert.match(sidebar, /function ThemeToggle/);
  assert.match(sidebar, /setTheme\(nextTheme\)/);
  assert.match(sidebar, /aria-label=\{`Switch to \$\{nextTheme\} mode`\}/);
  assert.match(sidebar, /<ThemeToggle \/>/);

  assert.doesNotMatch(transcript, /bg-\[#0f2142\] text-foreground/);
  assert.match(transcript, /bg-background text-foreground/);
  assert.match(transcript, /bg-blue-600 text-white/);
});

test("call transcript drawer uses a wide review layout", () => {
  const sheet = read("src/components/calls/CallTranscriptSheet.tsx");
  const audio = read("src/components/calls/AudioPlayer.tsx");
  const transcript = read("src/components/calls/Transcript.tsx");

  assert.match(sheet, /data-\[side=right\]:sm:w-\[min\(92vw,1040px\)\]/);
  assert.match(sheet, /data-\[side=right\]:sm:max-w-none/);
  assert.match(sheet, /data-\[side=right\]:xl:w-\[1040px\]/);
  assert.match(sheet, /lg:grid-cols-\[340px_minmax\(0,1fr\)\]/);
  assert.match(sheet, /Review tip/);
  assert.match(audio, /rounded-2xl border bg-background p-5/);
  assert.match(transcript, /sm:max-w-\[76%\]/);
});

test("phone numbers page supports filtering and a roomier buy flow", () => {
  const page = read("src/app/(app)/numbers/page.tsx");
  const drawer = read("src/components/numbers/BuyNumberDrawer.tsx");

  assert.match(page, /searchTerm/);
  assert.match(page, /providerFilter/);
  assert.match(page, /routingFilter/);
  assert.match(page, /filteredNumbers/);
  assert.match(page, /Search number, name, provider, or SID/);
  assert.match(page, /No numbers match these filters/);
  assert.match(page, /Clear filters/);

  assert.match(drawer, /data-\[side=right\]:sm:w-\[min\(94vw,940px\)\]/);
  assert.match(drawer, /data-\[side=right\]:sm:max-w-none/);
  assert.match(drawer, /Search criteria/);
  assert.match(drawer, /lg:grid-cols-\[260px_minmax\(0,1fr\)\]/);
  assert.match(drawer, /xl:grid-cols-2/);
  assert.match(drawer, /Buy this number/);
});
