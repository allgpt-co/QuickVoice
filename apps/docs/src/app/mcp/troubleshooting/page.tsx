import { DocsShell } from "@/components/docs-shell";
export default function TroubleshootingPage() {
  return (
    <DocsShell>
      <article className="prose prose-qv mx-auto max-w-4xl">
        <h1>Troubleshooting</h1>
        <h2>401 Unauthorized</h2>
        <p>
          Confirm the client sends a QuickVoice API key with{" "}
          <code>x-api-key</code> or{" "}
          <code>Authorization: Bearer &lt;key&gt;</code>. Do not use a console
          browser cookie as the MCP credential.
        </p>
        <h2>403 Insufficient permissions</h2>
        <p>
          The API key is valid but does not include the route permission
          required by the selected MCP tool or resource. Create a new key from{" "}
          <strong>Settings → API keys</strong> with the needed permission
          matrix, then reconnect the MCP client.
        </p>
        <h2>Upstream 404</h2>
        <p>
          The MCP server is reachable, but the configured{" "}
          <code>QUICKVOICE_API_BASE_URL</code> does not expose the wrapped API
          route. Deploy the latest QuickVoice server or point MCP at the correct
          API host.
        </p>
        <h2>Tool succeeds locally but fails remotely</h2>
        <p>
          Compare deployment environment, network egress,{" "}
          <code>QUICKVOICE_API_BASE_URL</code>, and API key permissions. Then
          run the MCP smoke script against the deployed URL.
        </p>
        <h2>Model picks a risky tool</h2>
        <p>
          Update the client approval policy so <code>external-cost</code> and{" "}
          <code>destructive</code> tools always require human confirmation.
        </p>
      </article>
    </DocsShell>
  );
}
