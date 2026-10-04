type McpTool = Record<string, unknown>;

const objectValue = (value: unknown): McpTool =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as McpTool)
    : {};

export const normalizeMcpTools = (value: unknown): McpTool[] =>
  (Array.isArray(value) ? value : []).flatMap((candidate) => {
    const tool = objectValue(candidate);
    if (typeof tool.name !== "string" || !tool.name.trim()) return [];
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
