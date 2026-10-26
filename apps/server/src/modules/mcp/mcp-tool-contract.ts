import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { Ajv, type ValidateFunction } from "ajv";
import { Ajv2019 } from "ajv/dist/2019.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import formatsPlugin from "ajv-formats";
import CustomApiError from "../../common/errors/customApiError.js";

const addFormats = formatsPlugin.default;
const MAX_SCHEMA_BYTES = 65_536;
const MAX_ARGUMENT_BYTES = 8192;
const validators = new Map<string, ValidateFunction>();
const options = { strict: false, allErrors: true, logger: false, ownProperties: true, coerceTypes: false, useDefaults: false, removeAdditional: false } as const;
const engines = {
  draft7: addFormats(new Ajv(options)),
  draft2019: addFormats(new Ajv2019(options)),
  draft2020: addFormats(new Ajv2020(options)),
};

export class McpToolContractError extends CustomApiError {
  constructor(code: "MCP_ARGUMENTS_INVALID" | "MCP_SCHEMA_UNAVAILABLE", details?: unknown) {
    super(code === "MCP_ARGUMENTS_INVALID"
      ? "Tool arguments do not match its input schema. Inspect the schema and correct the request."
      : "This tool has no usable input schema. Ask an administrator to refresh the connection.",
    code === "MCP_ARGUMENTS_INVALID" ? 422 : 409, { code, details });
  }
}

/** JSON Schema is provider data. Bound compilation and validation, never fetch $refs,
 * and never coerce, remove, or insert arguments on the caller's behalf.
 * https://ajv.js.org/security.html
 */
export function assertMcpArguments(schema: unknown, args: Record<string, unknown>): void {
  let validate: ValidateFunction;
  try {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error();
    const serialized = JSON.stringify(schema);
    if (Buffer.byteLength(serialized, "utf8") > MAX_SCHEMA_BYTES) throw new Error();
    const key = createHash("sha256").update(serialized).digest("hex");
    const cached = validators.get(key);
    if (cached) {
      validators.delete(key); validators.set(key, cached);
      validate = cached;
    } else {
      const dialect = (schema as Record<string, unknown>).$schema;
      const normalized = typeof dialect === "string" ? dialect.replace(/^http:/, "https:").replace(/#$/, "") : dialect;
      const engine = normalized === "https://json-schema.org/draft-07/schema"
        ? engines.draft7 : normalized === "https://json-schema.org/draft/2019-09/schema"
          ? engines.draft2019 : engines.draft2020;
      const canonical = normalized === "https://json-schema.org/draft-07/schema" ? "http://json-schema.org/draft-07/schema#" : normalized;
      const contract = dialect ? { ...schema, $schema: canonical } : schema;
      try {
        validate = runInNewContext("engine.compile(schema)", { engine, schema: contract }, { timeout: 1000 });
        if ("$async" in validate && validate.$async === true) throw new Error();
      } finally {
        // Ajv also caches schemas internally; retain only our bounded LRU below.
        engine.removeSchema();
      }
      // ponytail: at most 64 tool schemas per process; evict the oldest when busy.
      if (validators.size >= 64) validators.delete(validators.keys().next().value!);
      validators.set(key, validate);
    }
    if (Buffer.byteLength(JSON.stringify(args), "utf8") > MAX_ARGUMENT_BYTES) {
      throw new McpToolContractError("MCP_ARGUMENTS_INVALID", { issues: [{ message: "Tool arguments must be at most 8 KB" }] });
    }
    if (runInNewContext("validate(args)", { validate, args }, { timeout: 100 })) return;
  } catch (error) {
    if (error instanceof McpToolContractError) throw error;
    throw new McpToolContractError("MCP_SCHEMA_UNAVAILABLE");
  }
  throw new McpToolContractError("MCP_ARGUMENTS_INVALID", {
    inputSchema: schema,
    issues: (validate.errors ?? []).slice(0, 8).map(error => ({
      path: error.instancePath.slice(0, 256), keyword: error.keyword,
      field: String(error.params.additionalProperty ?? error.params.missingProperty ?? "").slice(0, 128),
      message: (error.message ?? "Invalid argument").slice(0, 256),
    })),
  });
}
