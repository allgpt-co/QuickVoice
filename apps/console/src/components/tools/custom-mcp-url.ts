export type CustomMcpUrlValidation = {
  isValid: boolean;
  tone: "hint" | "error" | "success";
  message: string;
};

export function validateCustomMcpUrl(value: string): CustomMcpUrlValidation {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      isValid: false,
      tone: "hint",
      message: "Paste the full HTTPS endpoint supplied by your MCP server provider.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      tone: "error",
      message: "Enter a full URL, such as https://server.example.com/mcp.",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      isValid: false,
      tone: "error",
      message: "Custom MCP endpoints must use HTTPS.",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      isValid: false,
      tone: "error",
      message: "Remove credentials from the URL. Authorization is completed after you connect.",
    };
  }

  return {
    isValid: true,
    tone: "success",
    message: "HTTPS endpoint ready. QuickVoice will verify the MCP server when you connect.",
  };
}
