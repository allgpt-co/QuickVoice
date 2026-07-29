export type DocsNavItem = {
  title: string;
  href: string;
  description?: string;
};

export type DocsNavGroup = {
  title: string;
  items: DocsNavItem[];
};

export const docsNav: DocsNavGroup[] = [
  {
    title: "Start",
    items: [
      { title: "Docs home", href: "/", description: "QuickVoice documentation entry point." },
      { title: "MCP overview", href: "/mcp", description: "What QuickVoice MCP connects and enables." },
      { title: "API reference", href: "/api-reference", description: "REST routes, auth, schemas, and responses." },
      { title: "Guides", href: "/guides", description: "Implementation and operations guides." },
      { title: "Changelog", href: "/changelog", description: "Documentation, API, and MCP updates." },
    ],
  },
  {
    title: "Reference",
    items: [
      { title: "Tools", href: "/mcp/tools", description: "Actions exposed by the MCP server." },
      { title: "Resources", href: "/mcp/resources", description: "Read-only MCP resources." },
      { title: "Safety", href: "/mcp/safety", description: "Permissions, risk levels, and destructive actions." },
    ],
  },
  {
    title: "Operate",
    items: [
      { title: "Troubleshooting", href: "/mcp/troubleshooting", description: "Fix common connection and session errors." },
      { title: "Self-hosting", href: "/mcp/self-hosting", description: "Deploy the dedicated MCP service on ECS." },
      { title: "MCP changelog", href: "/mcp/changelog", description: "Tool and resource schema changes." },
    ],
  },
];

export function flattenedDocsNav() {
  return docsNav.flatMap((group) => group.items);
}
