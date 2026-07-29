"use client";

import Script from "next/script";
import { useCallback, useEffect, useState } from "react";

type ScalarApiReference = {
  createApiReference: (
    selector: string,
    configuration: {
      url: string;
      layout: "modern";
      showSidebar: boolean;
      hideDarkModeToggle: boolean;
      theme: "default" | "moon";
      metaData: {
        title: string;
        description: string;
      };
    },
  ) => void;
};

declare global {
  interface Window {
    Scalar?: ScalarApiReference;
  }
}

const containerId = "quickvoice-scalar-api-reference";

function getDocsTheme() {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ScalarApiReference() {
  const [scriptReady, setScriptReady] = useState(false);
  const [theme, setTheme] = useState(getDocsTheme);

  const mountScalar = useCallback(() => {
    const scalar = window.Scalar;
    const container = document.getElementById(containerId);
    if (!scalar || !container) return;

    container.innerHTML = "";
    scalar.createApiReference(`#${containerId}`, {
      url: "/openapi.json",
      layout: "modern",
      showSidebar: true,
      hideDarkModeToggle: true,
      theme: theme === "dark" ? "moon" : "default",
      metaData: {
        title: "QuickVoice REST API reference",
        description: "QuickVoice endpoint reference. In Ask AI, explain the selected operation first, including its method, path, use case, auth, request fields, response, and side effects.",
      },
    });

  }, [theme]);

  useEffect(() => {
    if (!scriptReady) return;
    mountScalar();
  }, [mountScalar, scriptReady]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(getDocsTheme());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return (
    <main className="api-reference-surface min-h-screen bg-[var(--qv-bg)] text-[var(--qv-ink)]">
      <Script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference" strategy="afterInteractive" onReady={() => setScriptReady(true)} />
      <div className="border-b border-[var(--qv-border)] bg-[var(--qv-card)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 pr-24">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--qv-blue)]">API reference</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-[var(--qv-ink)]">QuickVoice REST API</h1>
          </div>
          <a className="rounded-full border border-[var(--qv-border)] px-4 py-2 text-sm font-semibold text-[var(--qv-muted)] transition hover:border-[var(--qv-blue)] hover:text-[var(--qv-blue)]" href="/openapi.json">
            View OpenAPI JSON
          </a>
        </div>
      </div>
      <div id={containerId} className="min-h-[calc(100vh-97px)]" />
      {!scriptReady ? (
        <div className="mx-auto max-w-4xl px-6 py-16 text-center text-sm text-[var(--qv-muted)]">
          Loading interactive API reference…
        </div>
      ) : null}
    </main>
  );
}
