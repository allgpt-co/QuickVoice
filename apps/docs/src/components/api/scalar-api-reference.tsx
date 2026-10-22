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
      withDefaultFonts: boolean;
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
const scalarScript =
  "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.3/dist/browser/standalone.js";
const scalarIntegrity =
  "sha384-HWi/QCSPi64AQ0xBXFGDk+7gmvZ4hJ/7sZMIXqWVz6Ikb6+Cxej/hWKaomOStyFb";

function getDocsTheme() {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ScalarApiReference() {
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptError, setScriptError] = useState(false);
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
      withDefaultFonts: false,
      theme: theme === "dark" ? "moon" : "default",
      metaData: {
        title: "QuickVoice REST API reference",
        description:
          "QuickVoice endpoint reference. In Ask AI, explain the selected operation first, including its method, path, use case, auth, request fields, response, and side effects.",
      },
    });
  }, [theme]);

  useEffect(() => {
    if (!scriptReady) return;
    mountScalar();
  }, [mountScalar, scriptReady]);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(getDocsTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <main className="api-reference-surface min-h-screen bg-[var(--qv-bg)] text-[var(--qv-ink)]">
      <Script
        src={scalarScript}
        integrity={scalarIntegrity}
        crossOrigin="anonymous"
        strategy="afterInteractive"
        onReady={() => {
          if (typeof window.Scalar?.createApiReference !== "function") {
            setScriptError(true);
            return;
          }
          setScriptError(false);
          setScriptReady(true);
        }}
        onError={() => setScriptError(true)}
      />
      <div className="border-b border-[var(--qv-border)] bg-[var(--qv-card)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 pr-24">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--qv-blue)]">
              API reference
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-[var(--qv-ink)]">
              QuickVoice REST API
            </h1>
          </div>
          <a
            className="rounded-full border border-[var(--qv-border)] px-4 py-2 text-sm font-semibold text-[var(--qv-muted)] transition hover:border-[var(--qv-blue)] hover:text-[var(--qv-blue)]"
            href="/openapi.json"
          >
            View OpenAPI JSON
          </a>
        </div>
      </div>
      <div id={containerId} className={scriptReady && !scriptError ? "min-h-[calc(100vh-97px)]" : "hidden"} />
      {scriptError ? (
        <div role="alert" className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h2 className="text-lg font-semibold">API reference could not load</h2>
          <p className="mt-3 text-sm text-[var(--qv-muted)]">
            Reload the page to try again, or use the OpenAPI JSON link above to view the API specification.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex min-h-11 items-center rounded-full border border-[var(--qv-border)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--qv-blue)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--qv-blue)] motion-reduce:transition-none"
          >
            Reload page
          </button>
        </div>
      ) : !scriptReady ? (
        <div role="status" className="mx-auto max-w-4xl px-6 py-16 text-center text-sm text-[var(--qv-muted)]">
          Loading interactive API reference…
        </div>
      ) : null}
    </main>
  );
}
