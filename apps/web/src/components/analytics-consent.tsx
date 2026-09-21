"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GoogleAnalytics } from "@/components/google-analytics";
import { captureEnquiryContext } from "@/lib/enquiry-context.mjs";
import {
  getConsentSnapshot, getServerConsentSnapshot, saveConsent, subscribeConsent,
} from "@/lib/analytics-consent.mjs";

export function AnalyticsConsent(props: {
  script: string | null;
  configuredId: string;
  manualPageviews: boolean;
}) {
  const consent = useSyncExternalStore(subscribeConsent, getConsentSnapshot, getServerConsentSnapshot);
  const [reopened, setReopened] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const reopenButton = useRef<HTMLButtonElement>(null);
  const visible = consent === "unknown" || reopened;

  useEffect(() => { captureEnquiryContext(); }, [consent]);
  useEffect(() => { if (reopened) heading.current?.focus(); }, [reopened]);

  function choose(choice: "granted" | "denied") {
    saveConsent(choice);
    setReopened(false);
    reopenButton.current?.focus();
  }

  return (
    <>
      {consent === "granted" && props.script && <GoogleAnalytics {...props} script={props.script} />}
      <div className="fixed bottom-3 left-3 z-[100] max-w-[calc(100vw-1.5rem)]">
        {visible && (
          <section
            id="analytics-choices"
            aria-labelledby="analytics-choices-title"
            className="mb-2 max-h-[70dvh] w-[28rem] max-w-full overflow-auto rounded-xl border border-border bg-background p-5 text-foreground shadow-xl"
            onKeyDown={(event) => {
              if (event.key === "Escape" && reopened) {
                setReopened(false);
                reopenButton.current?.focus();
              }
            }}
          >
            <h2 id="analytics-choices-title" ref={heading} tabIndex={-1} className="text-lg font-semibold">Your privacy choices</h2>
            <p className="mt-2 text-sm leading-relaxed">
              Optional analytics are off until you allow them. Google Analytics helps us
              understand page visits, link clicks and enquiry submissions. Allowing it
              also adds basic page and source context to enquiries. It does not receive
              your contact details or message from our enquiry tracking.
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              You can use the site and send an enquiry without analytics. We save only
              your choice in this browser. Change it anytime using Privacy choices.
              {" "}<a href="/privacy-policy" className="underline underline-offset-4">Privacy policy</a>.
            </p>
            <p className="mt-2 text-sm">Current choice: {consent === "granted" ? "analytics allowed" : "analytics off"}.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => choose("granted")} className="rounded-lg border border-foreground px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">Allow analytics</button>
              <button type="button" onClick={() => choose("denied")} className="rounded-lg border border-foreground px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">Decline analytics</button>
            </div>
          </section>
        )}
        <button ref={reopenButton} type="button" aria-controls="analytics-choices" aria-expanded={visible} onClick={() => setReopened(true)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2">
          Privacy choices
        </button>
      </div>
    </>
  );
}
