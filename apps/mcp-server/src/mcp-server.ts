import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callQuickVoiceApi } from "./api-client.js";
import { apiDefinitions, resourceDefinitions, toolDefinitions } from "./api-registry.js";
import type { ApiDefinition } from "./api-registry.js";

type ToolInput = Record<string, unknown> & {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
};

const jsonText = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(value, null, 2),
    },
  ],
});

const replacePathParams = (definition: ApiDefinition, input: Record<string, unknown>) => {
  let path = definition.path;
  for (const param of definition.params ?? []) {
    const value = input[param];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Missing required path parameter: ${param}`);
    }
    // URL parsing resolves standalone dot segments even when dots are percent-encoded.
    if (value === "." || value === "..") {
      throw new Error(`Invalid path parameter: ${param}`);
    }
    path = path.replace(`:${param}`, encodeURIComponent(value));
  }
  return path;
};

const resourceUri = (definition: ApiDefinition) =>
  definition.params?.length
    ? `quickvoice://${definition.name}/${definition.params.map((param) => `{${param}}`).join("/")}`
    : `quickvoice://${definition.name}`;

const resourceQuery = (definition: ApiDefinition, uri: URL) => {
  const query: Record<string, string> = {};
  for (const key of definition.queryKeys ?? []) {
    const value = uri.searchParams.get(key);
    if (value !== null) query[key] = value;
  }
  return query;
};

const resourceParams = (definition: ApiDefinition, variables: Record<string, unknown>) => {
  const input: Record<string, unknown> = {};
  for (const param of definition.params ?? []) {
    const value = variables[param];
    if (Array.isArray(value)) input[param] = value[0];
    else input[param] = value;
  }
  return input;
};

export function createQuickVoiceMcpServer() {
  const server = new McpServer({
    name: "quickvoice-api-mcp",
    version: "0.1.0",
  });

  server.registerResource(
    "api_catalog",
    "quickvoice://api_catalog",
    {
      title: "QuickVoice API catalog",
      description: "Machine-readable catalog of QuickVoice APIs exposed by this MCP server, including method, path, schema summary, auth, source file, and mapping kind.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "quickvoice://api_catalog",
          mimeType: "application/json",
          text: JSON.stringify(apiDefinitions, null, 2),
        },
      ],
    }),
  );

  for (const definition of resourceDefinitions) {
    server.registerResource(
      definition.name,
      new ResourceTemplate(resourceUri(definition), { list: undefined }),
      {
        title: definition.name,
        description: `${definition.description} Params/schema: ${definition.requestSchema}. Example use: read ${resourceUri(definition)}${definition.queryKeys?.length ? `?${definition.queryKeys[0]}=...` : ""}.`,
        mimeType: "application/json",
      },
      async (uri, variables, extra) => {
        const url = new URL(uri.href);
        const input = resourceParams(definition, variables as Record<string, unknown>);
        const path = replacePathParams(definition, input);
        const data = await callQuickVoiceApi({
          method: definition.method,
          path,
          query: resourceQuery(definition, url),
          signal: extra.signal,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      },
    );
  }

  for (const definition of toolDefinitions) {
    server.registerTool(
      definition.name,
      {
        title: definition.name,
        description: `${definition.description} Required params/body/query: ${definition.requestSchema}. Calls QuickVoice ${definition.method} ${definition.path}.`,
        inputSchema: definition.toolSchema ?? {
          query: z.record(z.string(), z.unknown()).optional(),
          body: z.record(z.string(), z.unknown()).optional(),
        },
        annotations: definition.toolAnnotations ?? {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async (input: ToolInput, extra) => {
        const path = replacePathParams(definition, input);
        const data = await callQuickVoiceApi({
          method: definition.method,
          path,
          query: input.query,
          body: input.body,
          signal: extra.signal,
        });
        return jsonText(data);
      },
    );
  }

  return server;
}
