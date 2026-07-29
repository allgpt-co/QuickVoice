export type McpClientGuide = {
  id: string;
  name: string;
  description: string;
  configLabel: string;
  steps: string[];
  verificationPrompt: string;
};

export const mcpClients: McpClientGuide[] = [
  {
    id: "cursor",
    name: "Cursor",
    description: "AI code editor",
    configLabel: "Add to Cursor MCP settings",
    steps: [
      "Open Cursor settings.",
      "Find MCP servers.",
      "Paste the QuickVoice configuration block.",
      "Restart the MCP connection.",
    ],
    verificationPrompt: "List my QuickVoice agents using MCP.",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    description: "AI code editor",
    configLabel: "Add to Windsurf MCP config",
    steps: [
      "Open Windsurf MCP settings.",
      "Create a new remote MCP server.",
      "Paste the generated Streamable HTTP config.",
      "Save and reconnect.",
    ],
    verificationPrompt: "Show my recent QuickVoice call logs.",
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    description: "Desktop MCP client",
    configLabel: "Add to Claude Desktop config",
    steps: [
      "Open Claude Desktop developer settings.",
      "Edit the MCP server configuration.",
      "Paste the QuickVoice server entry.",
      "Restart Claude Desktop.",
    ],
    verificationPrompt: "What QuickVoice MCP resources are available?",
  },
  {
    id: "claude-code",
    name: "Claude Code CLI",
    description: "Terminal MCP client",
    configLabel: "Add as remote HTTP MCP server",
    steps: [
      "Open your Claude Code MCP configuration.",
      "Add a QuickVoice remote server entry.",
      "Set the x-api-key header to your QuickVoice API key.",
      "Reconnect the CLI session.",
    ],
    verificationPrompt: "Use QuickVoice MCP to summarize active agents.",
  },
  {
    id: "codex",
    name: "Codex by OpenAI",
    description: "OpenAI coding agent",
    configLabel: "Add to Codex MCP settings",
    steps: [
      "Open your Codex MCP configuration.",
      "Add the QuickVoice Streamable HTTP endpoint.",
      "Set the x-api-key header to your QuickVoice API key.",
      "Start a new Codex session.",
    ],
    verificationPrompt: "Read QuickVoice dashboard metrics using MCP.",
  },
  {
    id: "vscode",
    name: "VS Code / Roo Code",
    description: "IDE MCP clients",
    configLabel: "Add to the extension MCP config",
    steps: [
      "Open the extension MCP server settings.",
      "Choose remote HTTP server.",
      "Paste the generated QuickVoice config.",
      "Reload the extension window if needed.",
    ],
    verificationPrompt: "Which QuickVoice MCP tools can update an agent?",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    description: "IDE assistant",
    configLabel: "Use the client-supported MCP config format",
    steps: [
      "Confirm remote MCP support is enabled.",
      "Add the QuickVoice URL and x-api-key header.",
      "Save the configuration.",
      "Open a new assistant chat.",
    ],
    verificationPrompt: "List available QuickVoice MCP tools.",
  },
  {
    id: "jetbrains",
    name: "JetBrains IDEs",
    description: "IntelliJ, PyCharm, and related IDEs",
    configLabel: "Add through the IDE MCP integration",
    steps: [
      "Open the IDE AI assistant settings.",
      "Find MCP server integrations.",
      "Add a Streamable HTTP server.",
      "Paste the URL and x-api-key header.",
    ],
    verificationPrompt: "Show the QuickVoice MCP resource list.",
  },
  {
    id: "openhands",
    name: "OpenHands",
    description: "Development agent",
    configLabel: "Add to OpenHands MCP configuration",
    steps: [
      "Open OpenHands runtime configuration.",
      "Add QuickVoice as a remote MCP server.",
      "Set the x-api-key header to your QuickVoice API key.",
      "Restart the runtime.",
    ],
    verificationPrompt: "Fetch QuickVoice MCP reference stats.",
  },
  {
    id: "other",
    name: "Other MCP clients",
    description: "Streamable HTTP-compatible clients",
    configLabel: "Use the generic MCP server block",
    steps: [
      "Confirm the client supports Streamable HTTP.",
      "Set the server URL to the QuickVoice MCP endpoint.",
      "Send x-api-key with a QuickVoice API key.",
      "Run a tools/list or resources/list request.",
    ],
    verificationPrompt: "List QuickVoice MCP tools and resources.",
  },
];
