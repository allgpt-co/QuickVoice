"use client";

import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useMemo, useState } from "react";
import { defaultMcpServerUrl, stringifyMcpConfig } from "@/lib/mcp-config";
import { McpCopyButton } from "./mcp-copy-button";

export function McpConfigGenerator() {
  const [apiKey, setApiKey] = useState("");
  const [serverUrl, setServerUrl] = useState(defaultMcpServerUrl);
  const [showKey, setShowKey] = useState(false);
  const config = useMemo(
    () => stringifyMcpConfig({ apiKey, serverUrl }),
    [apiKey, serverUrl],
  );

  return (
    <section id="setup" className="bg-white px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--qv-blue)]">
            MCP client setup guide
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">
            Generate your QuickVoice MCP config
          </h2>
          <p className="mt-4 text-base leading-7 text-[var(--qv-muted)]">
            Enter your QuickVoice API key and MCP endpoint to produce a config
            block. Values stay in this browser tab and are not sent anywhere.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-[var(--qv-border)] bg-[var(--qv-bg-muted)] p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-white text-[var(--qv-blue)] ring-1 ring-[var(--qv-border)]">
                <KeyRound aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h3 className="font-semibold tracking-tight text-slate-950">
                  Connection details
                </h3>
                <p className="text-sm text-[var(--qv-muted)]">
                  Use an organization-scoped API key with the permissions your
                  MCP client needs.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">
                  QuickVoice API key
                </span>
                <div className="mt-2 flex overflow-hidden rounded-2xl border border-[var(--qv-border)] bg-white focus-within:ring-2 focus-within:ring-[var(--qv-blue)]/20">
                  <input
                    className="min-h-12 min-w-0 flex-1 bg-transparent px-4 text-sm text-slate-950 outline-none placeholder:text-slate-400"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="qv_..."
                    type={showKey ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="grid min-h-12 w-12 place-items-center text-slate-500 transition hover:text-[var(--qv-blue)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--qv-blue)]/25"
                    onClick={() => setShowKey((current) => !current)}
                    aria-label={
                      showKey
                        ? "Hide QuickVoice API key"
                        : "Show QuickVoice API key"
                    }
                  >
                    {showKey ? (
                      <EyeOff aria-hidden="true" className="size-4" />
                    ) : (
                      <Eye aria-hidden="true" className="size-4" />
                    )}
                  </button>
                </div>
                <span className="mt-2 block text-xs leading-5 text-[var(--qv-muted)]">
                  The API key is only used to render the config below.
                </span>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-800">
                  MCP server URL
                </span>
                <input
                  className="mt-2 min-h-12 w-full rounded-2xl border border-[var(--qv-border)] bg-white px-4 text-sm text-slate-950 outline-none transition focus:ring-2 focus:ring-[var(--qv-blue)]/20"
                  value={serverUrl}
                  onChange={(event) => setServerUrl(event.target.value)}
                  placeholder={defaultMcpServerUrl}
                  type="url"
                  spellCheck={false}
                />
              </label>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-800 bg-[var(--qv-code)] shadow-xl shadow-slate-950/10">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Core configuration block
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  Copy this into your MCP client.
                </p>
              </div>
              <McpCopyButton value={config} />
            </div>
            <pre className="max-h-[420px] overflow-auto p-5 text-sm leading-7 text-slate-100">
              <code>{config}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
