"use client";

import { useEffect } from "react";
import { captureEnquiryContext } from "@/lib/enquiry-context.mjs";

/** Memory-only context for an optional later enquiry, not an analytics event. */
export function EnquiryAttribution() {
  useEffect(() => { captureEnquiryContext(); }, []);
  return null;
}
