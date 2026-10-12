type McpTool = Record<string, unknown>;

const objectValue = (value: unknown): McpTool =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as McpTool)
    : {};

export const normalizeMcpTools = (value: unknown): McpTool[] =>
  (Array.isArray(value) ? value : []).flatMap((candidate) => {
    const tool = objectValue(candidate);
    // Tool names enter an agent prompt and an API path; reject control characters.
    if (typeof tool.name !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(tool.name)) return [];
    return [{
      name: tool.name,
      description:
        typeof tool.description === "string"
          ? tool.description
          : typeof tool.title === "string"
            ? tool.title
            : "",
      inputSchema: tool.inputSchema ?? null,
      annotations: objectValue(tool.annotations),
      requiresConfirmation: mcpToolRequiresConfirmation(tool),
      ...(tool.sideEffect === true ? { sideEffect: true } : {}),
      ...(typeof tool.readOnly === "boolean" ? { readOnly: tool.readOnly } : {}),
      ...(typeof tool.mode === "string" ? { mode: tool.mode } : {}),
      ...(typeof tool.type === "string" ? { type: tool.type } : {}),
    }];
  });

export const findMcpTool = (tools: unknown, toolName: string) =>
  normalizeMcpTools(tools).find((tool) => tool.name === toolName) ?? null;

export const mcpToolRequiresConfirmation = (tool: McpTool) => {
  const annotations = objectValue(tool.annotations);
  if (
    tool.requiresConfirmation === true ||
    tool.sideEffect === true ||
    annotations.destructiveHint === true
  ) {
    return true;
  }
  const mode = String(tool.mode ?? tool.type ?? "").toLowerCase();
  if (["write", "mutation", "side_effect"].includes(mode)) return true;

  // Unknown tools fail closed. Only an explicit read-only declaration permits
  // autonomous execution; a user session can still invoke other allowlisted tools.
  return tool.readOnly !== true && annotations.readOnlyHint !== true;
};
