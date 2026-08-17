import Link from "next/link";
import { QuickVoiceLogo } from "@/components/quickvoice-logo";

const groups = [
  {
    title: "Product",
    links: ["Agents", "Outbound calls", "Phone numbers", "Website widget", "Call logs"],
  },
  {
    title: "Developers",
    links: ["MCP overview", "Tools", "Resources", "Self-hosting", "Troubleshooting"],
  },
  {
    title: "Company",
    links: ["Dashboard", "Support", "Privacy", "Status"],
  },
];

const hrefByLabel: Record<string, string> = {
  "MCP overview": "/mcp",
  Tools: "/mcp/tools",
  Resources: "/mcp/resources",
  "Self-hosting": "/mcp/self-hosting",
  Troubleshooting: "/mcp/troubleshooting",
  Dashboard: "/",
};

export function McpFooter() {
  return (
    <footer className="bg-slate-950 px-4 py-14 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.2fr_1.8fr]">
        <div>
          <Link className="flex items-center gap-3 font-semibold" href="/">
            <QuickVoiceLogo />
          </Link>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">QuickVoice helps teams build, operate, and connect AI voice agents for calls, widgets, and support workflows.</p>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-white">{group.title}</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-400">
                {group.links.map((label) => (
                  <li key={label}>
                    <Link className="transition hover:text-white" href={hrefByLabel[label] ?? "/mcp"}>{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-12 max-w-7xl border-t border-white/10 pt-6 text-center text-xs text-slate-500">© 2026 QuickVoice. All rights reserved.</div>
    </footer>
  );
}
