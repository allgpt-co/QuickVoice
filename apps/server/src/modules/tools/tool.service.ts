import { randomUUID } from "node:crypto";

import { BadRequestError } from "../../common/errors/badRequest.js";
import { NotFoundError } from "../../common/errors/notFound.js";
import { assertSafeRemoteUrl } from "../../lib/url-safety.js";
import {
  redactKeyValueSecrets,
  restoreRedactedSecretReferences,
} from "../../lib/secrets.js";
import {
  assertSecretReferencesOwnedByOrganization,
  deleteSecretReferences,
  pruneScopedSecretReferences,
  storeKeyValueSecretReferences,
} from "../secrets/secret-store.service.js";
import * as toolRepository from "./tool.repository.js";
import type { CreateToolArgs, UpdateToolInput } from "./tool.schema.js";

export const listTools = async (organizationId: string) =>
  (await toolRepository.listTools(organizationId)).map(redactToolSecrets);

export const createTool = async (args: CreateToolArgs) => {
  await assertSafeRemoteUrl(args.api_url);
  const toolId = randomUUID();
  const createdSecretIds: string[] = [];
  try {
    const protectedTool = await protectToolSecrets(
      args.organizationId,
      args.userId,
      toolId,
      args,
      undefined,
      createdSecretIds,
    );
    await assertToolSecretOwnership(protectedTool, args.organizationId);
    return redactToolSecrets(
      await toolRepository.createTool({ ...protectedTool, toolId }),
    );
  } catch (error) {
    await cleanupUncommittedSecrets(args.organizationId, createdSecretIds);
    throw error;
  }
};

export const updateTool = async (
  organizationId: string,
  toolId: string,
  data: UpdateToolInput,
) => {
  const existing = await toolRepository.findTool(organizationId, toolId);
  if (!existing) throw new NotFoundError("Tool not found");
  if (data.api_url) {
    await assertSafeRemoteUrl(data.api_url);
  }
  const createdSecretIds: string[] = [];
  let persisted = false;
  try {
    const protectedTool = await protectToolSecrets(
      organizationId,
      null,
      toolId,
      data,
      existing,
      createdSecretIds,
    );
    await assertToolSecretOwnership(protectedTool, organizationId);
    const updated = await toolRepository.updateTool(
      organizationId,
      toolId,
      protectedTool,
    );
    if (!updated) throw new NotFoundError("Tool not found");
    persisted = true;
    await cleanupReplacedToolSecrets(organizationId, toolId, existing, updated);
    return redactToolSecrets(updated);
  } catch (error) {
    if (!persisted) {
      await cleanupUncommittedSecrets(organizationId, createdSecretIds);
    }
    throw error;
  }
};

export const deleteTool = async (organizationId: string, toolId: string) => {
  const existing = await toolRepository.findTool(organizationId, toolId);
  if (!existing) throw new NotFoundError("Tool not found");
  const result = await toolRepository.deleteTool(organizationId, toolId);
  if (result.count === 0) throw new NotFoundError("Tool not found");
  await cleanupReplacedToolSecrets(organizationId, toolId, existing, {
    api_headers: null,
    dynamic_variables: null,
  });
};

export const getAgentTools = async (
  organizationId: string,
  agentId: string,
) => {
  const tools = await toolRepository.getAgentTools(organizationId, agentId);
  if (tools === null) throw new NotFoundError("Agent not found");
  return tools.map(redactToolSecrets);
};

export const attachTool = async (
  organizationId: string,
  agentId: string,
  toolId: string,
) => {
  const result = await toolRepository.attachTool(
    organizationId,
    agentId,
    toolId,
  );
  if (result === null) throw new NotFoundError("Agent or tool not found");
};

export const detachTool = async (
  organizationId: string,
  agentId: string,
  toolId: string,
) => {
  const result = await toolRepository.detachTool(
    organizationId,
    agentId,
    toolId,
  );
  if (result === null) throw new NotFoundError("Agent not found");
};

async function protectToolSecrets<T extends Record<string, any>>(
  organizationId: string,
  userId: string | null,
  toolId: string,
  tool: T,
  existingTool?: Record<string, any>,
  createdSecretIds?: string[],
): Promise<T> {
  let apiHeaders: unknown;
  let dynamicVariables: unknown;
  try {
    apiHeaders = restoreRedactedSecretReferences(
      tool.api_headers,
      existingTool?.api_headers,
    );
    dynamicVariables = restoreRedactedSecretReferences(
      tool.dynamic_variables,
      existingTool?.dynamic_variables,
    );
  } catch {
    throw new BadRequestError(
      "A redacted tool secret could not be preserved; enter it again",
    );
  }

  return {
    ...tool,
    api_headers: await storeKeyValueSecretReferences(apiHeaders, {
      organizationId,
      userId,
      namePrefix: `tool:${toolId}:api_headers`,
      createdSecretIds,
    }),
    dynamic_variables: await storeKeyValueSecretReferences(dynamicVariables, {
      organizationId,
      userId,
      namePrefix: `tool:${toolId}:dynamic_variables`,
      createdSecretIds,
    }),
  };
}

async function assertToolSecretOwnership(
  tool: Record<string, any>,
  organizationId: string,
) {
  try {
    await assertSecretReferencesOwnedByOrganization(
      [tool.api_headers, tool.dynamic_variables],
      organizationId,
    );
  } catch {
    throw new BadRequestError("One or more tool secrets are unavailable");
  }
}

async function cleanupReplacedToolSecrets(
  organizationId: string,
  toolId: string,
  previousTool: Record<string, any>,
  currentTool: Record<string, any>,
) {
  try {
    await pruneScopedSecretReferences({
      organizationId,
      namePrefixes: [
        `tool:${toolId}:api_headers`,
        `tool:${toolId}:dynamic_variables`,
      ],
      previousValues: [
        previousTool.api_headers,
        previousTool.dynamic_variables,
      ],
      currentValues: [currentTool.api_headers, currentTool.dynamic_variables],
    });
  } catch (error) {
    console.warn("[secrets] failed to prune replaced tool secrets", {
      organizationId,
      toolId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function cleanupUncommittedSecrets(
  organizationId: string,
  secretIds: string[],
) {
  try {
    await deleteSecretReferences(organizationId, secretIds);
  } catch (error) {
    console.warn("[secrets] failed to remove uncommitted tool secrets", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function redactToolSecrets<T extends Record<string, any>>(tool: T): T {
  return {
    ...tool,
    api_headers: redactKeyValueSecrets(tool.api_headers),
    dynamic_variables: redactKeyValueSecrets(tool.dynamic_variables),
  };
}
