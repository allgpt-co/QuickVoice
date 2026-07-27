"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";

// Human labels for known segments. Unknown segments render verbatim.
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  agents: "Agents",
  numbers: "Phone numbers",
  outbound: "Outbound",
  testing: "Testing",
  calls: "Call logs",
  kb: "Knowledge base",
  settings: "Settings",
  profile: "Profile",
  organization: "Organization",
  billing: "Billing",
  "api-keys": "API keys",
  roles: "Roles",
  danger: "Danger zone",
  orgs: "Organizations",
  new: "New",
  create: "Create",
};

function labelForSegment(seg: string) {
  return SEGMENT_LABELS[seg] ?? seg;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const isLast = i === segments.length - 1;
    const label = labelForSegment(seg);
    return { href, label, isLast };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((c, i) => (
          <Fragment key={c.href}>
            <BreadcrumbItem className={i === 0 ? "hidden md:block" : ""}>
              {c.isLast ? (
                <BreadcrumbPage className="capitalize">{c.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={c.href} className="capitalize">
                    {c.label}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {!c.isLast ? (
              <BreadcrumbSeparator
                className={i === 0 ? "hidden md:block" : ""}
              />
            ) : null}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
