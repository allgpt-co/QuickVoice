export const defaultMcpServerUrl = "http://f8v7lu4tuihjzigkrrun0s6d.207.244.241.161.sslip.io/mcp";

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
