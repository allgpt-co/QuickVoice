import { DocsShell } from "@/components/docs-shell";
import Link from "next/link";
import { CodeBlock } from "@/components/code-block";

export default function SelfHostingPage() {
  return (
    <DocsShell>
      <article className="prose prose-qv mx-auto max-w-4xl">
        <h1>Deploying the MCP service on ECS</h1>
        <p>
          Run QuickVoice MCP as the dedicated <code>apps/mcp-server</code> Node
          HTTP service. The docs app should stay responsible for the public
          setup UI and API reference; it should not host the production MCP
          runtime.
        </p>
        <p>
          See the <Link href="/mcp/architecture">architecture guide</Link> for
          the recommended service boundary.
        </p>

        <h2>Recommended production shape</h2>
        <CodeBlock
          code={`docs.quickvoice.co        → apps/docs        → documentation and setup UI
mcp.quickvoice.co/mcp    → apps/mcp-server  → Streamable HTTP MCP endpoint
api.quickvoice.co/api/v1 → apps/server      → QuickVoice REST APIs`}
        />

        <h2>Container command</h2>
        <CodeBlock
          code={`pnpm --filter quickvoice-mcp-server build
pnpm --filter quickvoice-mcp-server start`}
        />

        <h2>Required environment variables</h2>
        <ul>
          <li>
            <code>PORT</code>: HTTP port exposed by the MCP service.
          </li>
          <li>
            <code>MCP_ENDPOINT_PATH</code>: MCP endpoint path, default{" "}
            <code>/mcp</code>.
          </li>
          <li>
            <code>QUICKVOICE_API_BASE_URL</code>: internal or public QuickVoice
            API URL including <code>/api/v1</code>.
          </li>
          <li>
            <code>MCP_CORS_ORIGINS</code>: optional comma-separated browser
            origins allowed to call MCP.
          </li>
        </ul>
        <p>
          Do not configure a shared upstream API token in the MCP service.
          Clients send their own QuickVoice API key with <code>x-api-key</code>,
          and the MCP service forwards that key to the QuickVoice API so
          organization permissions remain authoritative.
        </p>

        <h2>Same ECS task vs dedicated ECS service</h2>
        <p>
          A dedicated ECS service is preferred because MCP traffic has different
          logs, auth, scaling, and failure modes than the console API or docs
          website. Running it in the same ECS task is acceptable for early
          low-traffic deployments, but keep it as a separate process with its
          own port, health check, and environment variables.
        </p>

        <h2>Health checks</h2>
        <p>
          Check the MCP HTTP listener and run the MCP smoke script after each
          deployment. The smoke script must call the MCP endpoint, not the raw
          QuickVoice REST API.
        </p>
        <CodeBlock
          code={`QUICKVOICE_API_KEY="YOUR_QUICKVOICE_API_KEY" \
MCP_URL="https://mcp.quickvoice.co/mcp" \
pnpm --filter quickvoice-mcp-server test:mcp`}
        />
      </article>
    </DocsShell>
  );
}
