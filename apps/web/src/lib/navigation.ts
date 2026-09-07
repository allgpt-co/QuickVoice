import { GITHUB_DOCS_URL, GITHUB_REPO_URL } from "@/lib/links";

export type NavigationItem = {
  label: string;
  href: string;
  children?: { label: string; href: string; description: string }[];
};

export const navigation: NavigationItem[] = [
  {
    label: "Solutions",
    href: "/solutions",
    children: [
      {
        label: "Solutions overview",
        href: "/solutions",
        description: "Find a practical starting point",
      },
      {
        label: "AI receptionist",
        href: "/solutions/ai-receptionist",
        description: "Give incoming calls a clear next step",
      },
      {
        label: "Answering service",
        href: "/solutions/ai-answering-service",
        description: "Capture the details your team needs",
      },
      {
        label: "Appointment requests",
        href: "/use-cases/appointment-scheduling",
        description: "Plan requests and confirmations",
      },
      {
        label: "Customer support",
        href: "/use-cases/customer-support",
        description: "Answer questions and route exceptions",
      },
      {
        label: "Sales qualification",
        href: "/use-cases/sales-lead-gen",
        description: "Structure enquiries and follow-up",
      },
      {
        label: "All workflows",
        href: "/use-cases",
        description: "Explore more business call types",
      },
    ],
  },
  { label: "Industries", href: "/industries" },
  { label: "Pricing", href: "/pricing" },
  {
    label: "Resources",
    href: "/resources",
    children: [
      {
        label: "Buyer resources",
        href: "/resources",
        description: "Download checklists and planning tools",
      },
      {
        label: "Guides",
        href: "/blog",
        description: "Understand, compare, and implement",
      },
      {
        label: "Workflow examples",
        href: "/case-studies",
        description: "Explore illustrative call scenarios",
      },
    ],
  },
  {
    label: "Open Source",
    href: "/open-source",
    children: [
      {
        label: "Platform overview",
        href: "/open-source",
        description: "Review the stack and prerequisites",
      },
      {
        label: "Source code",
        href: GITHUB_REPO_URL,
        description: "Inspect the MIT-licensed repository",
      },
      {
        label: "Repository documentation",
        href: GITHUB_DOCS_URL,
        description: "Explore setup and implementation",
      },
    ],
  },
];
