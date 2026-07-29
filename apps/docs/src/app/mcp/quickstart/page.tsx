import { DocsShell } from "@/components/docs-shell";
import { CodeBlock } from "@/components/code-block";

export default function QuickstartPage() {
  return (
    <DocsShell>
      <article className="prose prose-qv mx-auto max-w-4xl">
        <p className="lead">
          Use this flow to connect an MCP-capable client to the dedicated
          QuickVoice MCP service over Streamable HTTP.
        </p>
        <h1>Quickstart</h1>
        <h2>1. Start the dedicated MCP HTTP service</h2>
        <CodeBlock
          code={`pnpm --filter quickvoice-mcp-server build
PORT=8787 \
MCP_ENDPOINT_PATH="/mcp" \
QUICKVOICE_API_BASE_URL="https://api.quickvoice.co/api/v1" \
pnpm --filter quickvoice-mcp-server start`}
        />
        <p>
          The MCP service lives in <code>apps/mcp-server</code>. Keep{" "}
          <code>apps/docs</code> for this setup UI and API documentation.
        </p>
        <p>
          The MCP service does not use a separate MCP-only token. Each client
          request sends a QuickVoice organization API key, and the MCP service
          forwards that key to the existing QuickVoice API permission layer.
        </p>
        <h2>2. Add the remote endpoint to your client</h2>
        <CodeBlock
          language="json"
          code={`{
  "mcpServers": {
    "quickvoice": {
      "url": "https://mcp.quickvoice.co/mcp",
      "transport": "streamable-http",
      "headers": {
        "x-api-key": "YOUR_QUICKVOICE_API_KEY"
      }
    }
  }
}`}
        />
        <h2>3. Verify the connection</h2>
        <p>
          Run the MCP smoke script from the repository. It talks to the MCP
          endpoint, not the raw REST API.
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
