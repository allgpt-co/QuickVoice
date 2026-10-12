-- Keep execution history after an MCP connection is disconnected.
ALTER TABLE "McpToolExecutionLog"
  DROP CONSTRAINT "McpToolExecutionLog_mcpConnectionId_fkey";
