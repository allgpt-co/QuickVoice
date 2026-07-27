import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { apiEndpointCount, apiGroups, type ApiLifecycle } from "../src/data/api-reference";
import { buildQuickVoiceOpenApi } from "../src/lib/openapi";

type Finding = { message: string; location?: string };

const findings: Finding[] = [];
const doc = buildQuickVoiceOpenApi();
const allowedLifecycles = new Set<ApiLifecycle>(["public-v1", "internal-runtime", "public-widget-origin"]);

function fail(message: string, location?: string) {
  findings.push({ message, location });
}

function pathParams(path: string) {
  return Array.from(path.matchAll(/\{([^}]+)\}/g), (match) => match[1]);
}

if (doc.openapi !== "3.1.0") fail(`Expected OpenAPI 3.1.0, received ${doc.openapi}`);
if (!doc.info.title || !doc.info.version) fail("OpenAPI info.title and info.version are required");
if (!doc.servers.length) fail("At least one OpenAPI server is required");

const operations: Array<{ method: string; path: string; operationId: string; security?: Array<Record<string, string[]>> }> = [];
for (const [path, item] of Object.entries(doc.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!operation) continue;
    operations.push({ method, path, operationId: operation.operationId, security: operation.security });

    const declaredPathParams = (operation.parameters ?? [])
      .filter((param) => param.in === "path")
      .map((param) => param.name);
    const actualPathParams = pathParams(path);

    for (const param of actualPathParams) {
      if (!declaredPathParams.includes(param)) fail(`Missing path parameter declaration: ${param}`, `${method.toUpperCase()} ${path}`);
    }
    for (const param of declaredPathParams) {
      if (!actualPathParams.includes(param)) fail(`Declared path parameter is not present in path: ${param}`, `${method.toUpperCase()} ${path}`);
    }

    const responseCodes = Object.keys(operation.responses ?? {});
    if (!responseCodes.length) fail("Operation must declare at least one response", `${method.toUpperCase()} ${path}`);
    if (!operation.summary || !operation.description) fail("Operation summary and description are required", `${method.toUpperCase()} ${path}`);
    if (!allowedLifecycles.has(operation["x-quickvoice-lifecycle"] as ApiLifecycle)) {
      fail("Operation must declare a valid QuickVoice lifecycle classification", `${method.toUpperCase()} ${path}`);
    }
  }
}

if (operations.length !== apiEndpointCount) {
  fail(`Documented operation count mismatch. Expected ${apiEndpointCount}, received ${operations.length}`);
}

const operationIds = new Set<string>();
for (const operation of operations) {
  if (operationIds.has(operation.operationId)) fail(`Duplicate operationId: ${operation.operationId}`, `${operation.method.toUpperCase()} ${operation.path}`);
  operationIds.add(operation.operationId);

  for (const security of operation.security ?? []) {
    for (const scheme of Object.keys(security)) {
      if (!(scheme in doc.components.securitySchemes)) {
        fail(`Unknown security scheme: ${scheme}`, `${operation.method.toUpperCase()} ${operation.path}`);
      }
    }
  }

  if (operation.path.startsWith("/public/widgets/") && operation.security) {
    fail("Public widget endpoints must not advertise bearer-token authentication", `${operation.method.toUpperCase()} ${operation.path}`);
  }
  if (operation.path.includes("internal") || operation.path.includes("number-config")) {
    const usesInternalKey = operation.security?.some((entry) => "internalApiKey" in entry);
    if (!usesInternalKey) fail("Internal runtime endpoints must advertise internalApiKey security", `${operation.method.toUpperCase()} ${operation.path}`);
  }
}

for (const group of apiGroups) {
  if (!group.slug || !group.title || !group.description) fail("API groups require slug, title, and description", group.slug || group.title);
  for (const endpoint of group.endpoints) {
    if (!allowedLifecycles.has(endpoint.lifecycle)) {
      fail(`Endpoint has invalid lifecycle classification: ${endpoint.lifecycle}`, `${endpoint.method} ${endpoint.path}`);
    }
    if (!existsSync(resolve(process.cwd(), "../..", endpoint.source))) {
      fail(`Documented source file does not exist: ${endpoint.source}`, `${endpoint.method} ${endpoint.path}`);
    }
  }
}

if (findings.length) {
  console.error(`OpenAPI contract validation failed with ${findings.length} finding(s):`);
  for (const finding of findings) {
    console.error(`- ${finding.location ? `${finding.location}: ` : ""}${finding.message}`);
  }
  process.exit(1);
}

console.log(`OpenAPI contract validation passed: ${operations.length} operations across ${Object.keys(doc.paths).length} paths.`);
