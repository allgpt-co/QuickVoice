"use client";

import { useId, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { useTestMcpAccess } from "@/src/hooks/queries/mcp";
import type { McpConnection } from "@/src/lib/api/types";

export function McpAccessTest({ connection }: { connection: McpConnection }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [toolName, setToolName] = useState<string | null>(null);
  const [argumentsJson, setArgumentsJson] = useState("{}");
  const [validationError, setValidationError] = useState("");
  const test = useTestMcpAccess(connection.mcpConnectionId);
  const tools = (connection.tools ?? []).filter((tool) => tool.requiresConfirmation === false);
  const canTest = ["CONNECTED", "AUTH_REQUIRED"].includes(connection.status);
  const auth = connection.metadata?.providerAuthorization as { pendingTools?: string[]; verifiedTools?: string[] } | undefined;
  const selected = toolName === null
    ? tools.find((tool) => auth?.pendingTools?.includes(tool.name)) ?? tools[0]
    : tools.find((tool) => tool.name === toolName);

  function runTest() {
    if (!selected) return;
    try {
      const args: unknown = JSON.parse(argumentsJson);
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Enter a JSON object, such as {}.");
      if (new TextEncoder().encode(argumentsJson).length > 8192) throw new Error("Arguments must be at most 8 KB.");
      setValidationError("");
      setToolName(selected.name);
      test.mutate({ toolName: selected.name, arguments: args as Record<string, unknown> });
    } catch (error) {
      setValidationError(error instanceof SyntaxError ? "Enter valid JSON, such as {}." : (error as Error).message);
    }
  }

  return (
    <div className="mt-4 min-w-0 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-muted-foreground">
          {!canTest ? "Complete server setup or refresh this connection before testing account access." : auth?.pendingTools?.length
            ? "Account authorization is required before the requested tools can be used in calls."
            : auth?.verifiedTools?.length
              ? `${auth.verifiedTools.length} read-only ${auth.verifiedTools.length === 1 ? "tool verified" : "tools verified"}. Other tools may need additional permissions.`
              : "Connected to the server. Test account access before using it in calls."}
        </p>
        <Button type="button" variant="outline" className="min-h-11 shrink-0" aria-expanded={open} disabled={!canTest}
          aria-controls={`${id}-panel`} onClick={() => setOpen(!open)}>
          <ShieldCheck className="size-4" /> {open ? "Hide access test" : "Test access"}
        </Button>
      </div>
      {open && (
        <div id={`${id}-panel`} className="mt-4 min-w-0 space-y-4 rounded-lg border bg-muted/20 p-4">
          <div>
            <p className="font-medium">Verify your organization&apos;s account</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Run a read-only tool, authorize the account if requested, then run the same test again.
              Attached agents reuse this saved connection. Callers do not need an authorization link.
            </p>
          </div>
          {!tools.length ? (
            <p role="status" className="text-sm text-muted-foreground">No tools are explicitly marked read-only. Refresh the connection to fetch permissions. Setup tests cannot run tools requiring confirmation.</p>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor={`${id}-tool`} className="text-sm font-medium">Read-only tool</label>
                <select id={`${id}-tool`} value={selected?.name ?? ""} disabled={test.isPending}
                  className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
                  onChange={(event) => { setToolName(event.target.value); setArgumentsJson("{}"); setValidationError(""); test.reset(); }}>
                  {tools.map((tool) => <option key={tool.name} value={tool.name}>{tool.name}</option>)}
                </select>
                {selected?.description && <p className="text-sm text-muted-foreground">{selected.description}</p>}
              </div>
              <div className="space-y-2">
                <label htmlFor={`${id}-arguments`} className="text-sm font-medium">Arguments (JSON)</label>
                <textarea id={`${id}-arguments`} value={argumentsJson} rows={4} disabled={test.isPending}
                  aria-invalid={Boolean(validationError)} aria-describedby={`${id}-help${validationError ? ` ${id}-error` : ""}`}
                  onChange={(event) => { setArgumentsJson(event.target.value); setValidationError(""); test.reset(); }}
                  className="w-full rounded-md border bg-background p-3 font-mono text-sm" />
                <p id={`${id}-help`} className="text-sm text-muted-foreground">Use {"{}"} for a tool with no required inputs. For events, supply the calendar, date range, and timezone requested by its schema.</p>
                {selected?.inputSchema && <details className="text-sm">
                  <summary className="cursor-pointer py-2">View tool input schema</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-3 text-xs">{JSON.stringify(selected.inputSchema, null, 2)}</pre>
                </details>}
              </div>
              {validationError && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{validationError}</p>}
              {test.error && <p role="alert" className="text-sm text-destructive">{test.error.message}</p>}
              <Button type="button" className="min-h-11" disabled={test.isPending || !selected} onClick={runTest}>
                {test.isPending && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
                {test.isPending ? "Testing access…" : "Run read-only test"}
              </Button>
            </>
          )}
          {test.data?.status === "AUTH_REQUIRED" && <div role="alert" className="space-y-3 rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
            <p className="font-medium">Authorize the connected account</p>
            <p>Complete authorization in your browser, then return here and run this tool test again. Saying “I authorize” during a call does not complete setup.</p>
            {test.data.authorizationUrl?.startsWith("https://") ? <Button asChild variant="outline" className="min-h-11">
              <a href={test.data.authorizationUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" /> Authorize account</a>
            </Button> : <p>The provider did not supply a supported authorization link. Check its account setup.</p>}
          </div>}
          {test.data?.status === "VERIFIED" && <div role="status" className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            <p className="flex items-center gap-2 break-all font-medium"><CheckCircle2 className="size-4 shrink-0" /> Access verified for {test.data.toolName}</p>
            <p>Repeat with each read-only tool your agent needs, then start a new test call.</p>
            <details><summary className="cursor-pointer py-2">View test result</summary>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-3 text-xs">{JSON.stringify(test.data.result, null, 2)?.slice(0, 8000)}</pre>
            </details>
          </div>}
        </div>
      )}
    </div>
  );
}
