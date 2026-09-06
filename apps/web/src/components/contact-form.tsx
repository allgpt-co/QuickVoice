"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { trackContactLead } from "@/lib/analytics";
import {
  CONTACT_FIELDS,
  CONTACT_LABELS,
  CONTACT_LIMITS,
  emptyContactFields,
  validateContactFields,
  type ContactField,
  type ContactErrors,
} from "@/lib/contact-validation.mjs";

const fieldClass =
  "mt-2 block min-h-12 w-full rounded-lg border border-input bg-background px-3 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive disabled:cursor-wait disabled:opacity-70";
const fallbackMessage =
  "We could not confirm delivery. Your message is still here. Please try again or email our team.";

export function ContactForm({
  location,
}: {
  location: "homepage" | "contact_page";
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const [fields, setFields] = useState(emptyContactFields);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [deliveryError, setDeliveryError] = useState("");
  const fieldId = (field: ContactField) => `${id}-${field}`;

  function focusField(field: ContactField) {
    requestAnimationFrame(() => {
      const control = formRef.current?.elements.namedItem(field);
      if (control instanceof HTMLElement) control.focus();
    });
  }

  function updateField(field: ContactField, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || status === "success") return;
    const checked = validateContactFields(fields);
    setErrors(checked.errors);
    const firstError = CONTACT_FIELDS.find((field) => checked.errors[field]);
    if (firstError) {
      focusField(firstError);
      return;
    }

    inFlight.current = true;
    setStatus("submitting");
    setDeliveryError("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checked.fields),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        if (response.status === 400 && result?.fieldErrors) {
          const serverErrors: ContactErrors = {};
          for (const field of CONTACT_FIELDS) {
            const message = result.fieldErrors[field];
            if (typeof message === "string") serverErrors[field] = message;
          }
          const firstInvalid = CONTACT_FIELDS.find(
            (field) => serverErrors[field],
          );
          if (firstInvalid) {
            setErrors(serverErrors);
            setStatus("idle");
            focusField(firstInvalid);
            return;
          }
        }
        setDeliveryError(
          response.status === 503
            ? "Contact delivery is temporarily unavailable. Your message is still here; you can email our team directly."
            : fallbackMessage,
        );
        setStatus("error");
      } else {
        trackContactLead(location);
        setStatus("success");
      }
      requestAnimationFrame(() => statusRef.current?.focus());
    } catch {
      setDeliveryError(fallbackMessage);
      setStatus("error");
      requestAnimationFrame(() => statusRef.current?.focus());
    } finally {
      inFlight.current = false;
    }
  }

  function startAnotherMessage() {
    setFields(emptyContactFields());
    setErrors({});
    setDeliveryError("");
    setStatus("idle");
    focusField("name");
  }

  function fieldProps(field: ContactField) {
    return {
      id: fieldId(field),
      name: field,
      value: fields[field],
      maxLength: CONTACT_LIMITS[field],
      "aria-invalid": Boolean(errors[field]),
      "aria-describedby":
        [
          errors[field] ? `${fieldId(field)}-error` : "",
          field === "message" ? `${id}-message-help` : "",
        ]
          .filter(Boolean)
          .join(" ") || undefined,
      className: fieldClass,
      onChange: (
        event: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => updateField(field, event.target.value),
    };
  }

  function fieldError(field: ContactField) {
    return errors[field] ? (
      <p
        id={`${fieldId(field)}-error`}
        className="mt-2 text-sm text-destructive"
      >
        {errors[field]}
      </p>
    ) : null;
  }

  const invalidFields = CONTACT_FIELDS.filter((field) => errors[field]);

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      aria-label="Contact the QuickVoice team"
      className="min-w-0"
    >
      <div aria-live="polite" aria-atomic="true">
        {status === "success" && (
          <div
            ref={statusRef}
            tabIndex={-1}
            role="status"
            className="rounded-xl border border-primary/25 bg-primary/5 p-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CheckCircle2
              className="mb-4 h-7 w-7 text-primary"
              aria-hidden="true"
            />
            <h3 className="text-xl font-semibold">
              Your message has been delivered.
            </h3>
            <p className="mt-3 text-muted-foreground">
              Thank you for contacting the QuickVoice team.
            </p>
            <button
              type="button"
              onClick={startAnotherMessage}
              className="mt-6 min-h-11 rounded-lg border border-border bg-background px-4 py-2 font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              Send another message
            </button>
          </div>
        )}
        {status === "submitting" && (
          <p role="status" className="mb-4 text-sm text-muted-foreground">
            Sending your message…
          </p>
        )}
      </div>
      {status === "error" && (
        <div
          ref={statusRef}
          tabIndex={-1}
          role="alert"
          className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p>{deliveryError}</p>
          <a
            href="mailto:info@quickvoice.co"
            className="mt-2 inline-block font-medium text-primary underline underline-offset-4"
          >
            Email info@quickvoice.co
          </a>
        </div>
      )}
      {invalidFields.length > 0 && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-destructive/30 p-4 text-sm"
        >
          <p className="font-medium">Please check the highlighted fields.</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {invalidFields.map((field) => (
              <li key={field}>
                <a
                  href={`#${fieldId(field)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    focusField(field);
                  }}
                  className="underline underline-offset-4"
                >
                  {CONTACT_LABELS[field]}: {errors[field]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <fieldset
        disabled={status === "submitting"}
        hidden={status === "success"}
        aria-busy={status === "submitting"}
        className="min-w-0 space-y-5"
      >
        <legend className="sr-only">Your enquiry</legend>
        <p className="text-sm text-muted-foreground">
          Fields marked optional can be left blank.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={fieldId("name")} className="text-sm font-medium">
              Name
            </label>
            <input {...fieldProps("name")} autoComplete="name" required />
            {fieldError("name")}
          </div>
          <div>
            <label htmlFor={fieldId("email")} className="text-sm font-medium">
              Email
            </label>
            <input
              {...fieldProps("email")}
              type="email"
              autoComplete="email"
              inputMode="email"
              required
            />
            {fieldError("email")}
          </div>
          <div>
            <label htmlFor={fieldId("company")} className="text-sm font-medium">
              Company{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <input {...fieldProps("company")} autoComplete="organization" />
            {fieldError("company")}
          </div>
          <div>
            <label htmlFor={fieldId("phone")} className="text-sm font-medium">
              Phone{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <input
              {...fieldProps("phone")}
              type="tel"
              autoComplete="tel"
              placeholder="+1 (218) 452-5998"
            />
            {fieldError("phone")}
          </div>
        </div>
        <div>
          <label
            htmlFor={fieldId("lookingFor")}
            className="text-sm font-medium"
          >
            Enquiry type
          </label>
          <select {...fieldProps("lookingFor")} required>
            <option value="General Inquiry">General enquiry</option>
            <option value="Pricing">Pricing</option>
            <option value="Implementation">Implementation</option>
            <option value="Support">Support</option>
          </select>
          {fieldError("lookingFor")}
        </div>
        <div>
          <label htmlFor={fieldId("message")} className="text-sm font-medium">
            Message
          </label>
          <p
            id={`${id}-message-help`}
            className="mt-1 text-sm text-muted-foreground"
          >
            Tell us about your calling workflow and what you would like to
            achieve. 10–5,000 characters.
          </p>
          <textarea
            {...fieldProps("message")}
            className={`${fieldClass} resize-y`}
            rows={5}
            required
          />
          {fieldError("message")}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Please leave out passwords and sensitive customer information. Read
          our{" "}
          <a
            href="/privacy-policy"
            className="text-primary underline underline-offset-4"
          >
            privacy policy
          </a>
          .
        </p>
        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-70"
        >
          {status === "submitting" ? "Sending…" : "Send enquiry"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </fieldset>
    </form>
  );
}
