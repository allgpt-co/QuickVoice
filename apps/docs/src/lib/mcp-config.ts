export const defaultMcpServerUrl = "https://mcp.quickvoice.co/mcp";

export function buildMcpConfig({
  apiKey,
  serverUrl,
}: {
  apiKey: string;
  serverUrl: string;
}) {
  return {
    mcpServers: {
      quickvoice: {
        url: serverUrl.trim() || defaultMcpServerUrl,
        transport: "streamable-http",
        headers: {
          "x-api-key": apiKey.trim() || "YOUR_QUICKVOICE_API_KEY",
        },
      },
    },
  };
}

export function stringifyMcpConfig(input: {
  apiKey: string;
  serverUrl: string;
}) {
  return JSON.stringify(buildMcpConfig(input), null, 2);
}
