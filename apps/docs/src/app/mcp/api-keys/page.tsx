import { DocsShell } from "@/components/docs-shell";
export default function ApiKeysPage() {
  return (
    <DocsShell>
      <article className="prose prose-qv mx-auto max-w-4xl">
        <h1>API keys and authentication</h1>
        <p>
          The remote MCP endpoint must not be public. QuickVoice MCP
          authenticates every request with the caller&apos;s organization-scoped
          QuickVoice API key, then forwards that key to the existing QuickVoice
          API layer.
        </p>
        <h2>Create a key</h2>
        <ol>
          <li>Open the QuickVoice console.</li>
          <li>
            Go to <strong>Settings → API keys</strong>.
          </li>
          <li>
            Create a new key and choose the permissions your MCP client needs.
            The default matrix is MCP-ready for trusted automation.
          </li>
          <li>Copy the key once and store it in your secret manager.</li>
        </ol>
        <h2>Required environment</h2>
        <ul>
          <li>
            <code>QUICKVOICE_API_BASE_URL</code>: server API base URL including
            the API version prefix, for example{" "}
            <code>https://api.quickvoice.co/api/v1</code>.
          </li>
          <li>
            <code>PORT</code> or <code>MCP_PORT</code>: HTTP port for{" "}
            <code>apps/mcp-server</code>. The default is <code>8787</code>.
          </li>
          <li>
            <code>MCP_ENDPOINT_PATH</code>: endpoint path. The default is{" "}
            <code>/mcp</code>.
          </li>
          <li>
            <code>MCP_CORS_ORIGINS</code>: optional comma-separated browser
            origins allowed to call the MCP endpoint.
          </li>
        </ul>
        <h2>Client header</h2>
        <p>
          Send the copied key on every MCP request with <code>x-api-key</code>.
          The MCP server also accepts{" "}
          <code>Authorization: Bearer &lt;key&gt;</code> for client
          compatibility, but <code>x-api-key</code> is the canonical QuickVoice
          header.
        </p>
        <h2>Rotation checklist</h2>
        <ol>
          <li>
            Create a new QuickVoice API key in the console with the same or
            narrower permissions.
          </li>
          <li>Update the MCP client secret/configuration.</li>
          <li>Update client configuration and verify the MCP handshake.</li>
          <li>Revoke the old API key after all clients are migrated.</li>
        </ol>
      </article>
    </DocsShell>
  );
}
