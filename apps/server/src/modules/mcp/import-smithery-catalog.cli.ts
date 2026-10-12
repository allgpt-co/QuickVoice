import "dotenv/config";
import prisma from "../../config/prisma.js";

type SmitheryServer = {
  id: string;
  qualifiedName: string;
  namespace: string;
  slug?: string;
  displayName?: string;
  description?: string;
  iconUrl?: string;
  verified?: boolean;
  useCount?: number;
  remote?: boolean;
  isDeployed?: boolean;
  homepage?: string;
  bySmithery?: boolean;
  owner?: string;
  score?: number;
};

type SmitheryServerListResponse = {
  servers: SmitheryServer[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
};

const SMITHERY_API_BASE_URL = process.env.SMITHERY_API_BASE_URL || "https://api.smithery.ai";
const PAGE_SIZE = 100;
const STABLE_SEED = 20260603;
const ENRICHMENT_QUERIES = [
  "salesforce",
  "hubspot",
  "zapier",
  "crm",
  "marketing automation",
  "customer support",
  "sales intelligence",
  "email marketing",
  "payments",
  "project management",
  "analytics",
  "database",
  "calendar",
  "documents",
  "communication",
];
const EXPECTED_QUALIFIED_NAMES = ["salesforce", "hubspot", "zapier"];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "smithery-mcp";

const getSmitheryApiKey = () => {
  const key = process.env.SMITHERY_API_KEY;
  if (!key) {
    throw new Error("SMITHERY_API_KEY is required to import the Smithery catalog");
  }
  return key;
};

const addCommonParams = (url: URL) => {
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  url.searchParams.set("remote", "true");
  url.searchParams.set("isDeployed", "true");
  url.searchParams.set("seed", String(STABLE_SEED));
  url.searchParams.set(
    "fields",
    [
      "id",
      "qualifiedName",
      "namespace",
      "slug",
      "displayName",
      "description",
      "iconUrl",
      "verified",
      "useCount",
      "remote",
      "isDeployed",
      "homepage",
      "bySmithery",
      "owner",
      "score",
    ].join(",")
  );
};

const fetchPage = async (page: number, q?: string): Promise<SmitheryServerListResponse> => {
  const url = new URL("/servers", SMITHERY_API_BASE_URL);
  url.searchParams.set("page", String(page));
  if (q) {
    url.searchParams.set("q", q);
    url.searchParams.set("topK", "500");
  }
  addCommonParams(url);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${getSmitheryApiKey()}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || `Smithery catalog fetch failed with ${response.status}`);
  }
  return body as SmitheryServerListResponse;
};

const mcpUrlFor = (server: SmitheryServer) =>
  `https://server.smithery.ai/${server.qualifiedName}`;

const importServer = async (server: SmitheryServer, importedAt: Date) => {
  if (!server.id || !server.qualifiedName) return "skipped" as const;

  const slug = slugify(server.qualifiedName);
  const name = server.displayName?.trim() || server.qualifiedName;
  const mcpUrl = mcpUrlFor(server);
  const existing = await prisma.mcpServerCatalogItem.findFirst({
    where: {
      organizationId: null,
      mcpUrl,
    },
  });
  const data = {
    organizationId: null,
    slug,
    name,
    description: server.description || "Smithery MCP server",
    source: "SMITHERY" as const,
    provider: "smithery",
    mcpUrl,
    smitheryServerKey: server.qualifiedName,
    authType: "oauth",
    categories: ["Smithery"],
    verified: Boolean(server.verified),
    toolCount: server.useCount ?? 0,
    metadata: {
      smitheryId: server.id,
      qualifiedName: server.qualifiedName,
      namespace: server.namespace,
      iconUrl: server.iconUrl ?? null,
      homepage: server.homepage ?? null,
      useCount: server.useCount ?? 0,
      remote: server.remote ?? true,
      isDeployed: server.isDeployed ?? true,
      bySmithery: server.bySmithery ?? false,
      owner: server.owner ?? null,
      score: server.score ?? null,
      importedAt: importedAt.toISOString(),
    },
  };

  if (existing) {
    await prisma.mcpServerCatalogItem.update({
      where: { mcpServerId: existing.mcpServerId },
      data,
    });
    return "updated" as const;
  }

  await prisma.mcpServerCatalogItem.create({ data });
  return "imported" as const;
};

const importResultPage = async (
  servers: SmitheryServer[],
  importedAt: Date,
  seen: Set<string>
) => {
  let imported = 0;
  let updated = 0;

  for (const server of servers) {
    if (!server.qualifiedName || seen.has(server.qualifiedName)) continue;
    seen.add(server.qualifiedName);
    const result = await importServer(server, importedAt);
    if (result === "imported") imported += 1;
    if (result === "updated") updated += 1;
  }

  return { imported, updated };
};

async function main() {
  let imported = 0;
  let updated = 0;
  let page = 1;
  let totalPages = 1;
  const startedAt = new Date();
  const seen = new Set<string>();

  do {
    const result = await fetchPage(page);
    totalPages = result.pagination.totalPages;
    const counts = await importResultPage(result.servers, startedAt, seen);
    imported += counts.imported;
    updated += counts.updated;

    console.log(`Imported Smithery catalog page ${page}/${totalPages}`);
    page += 1;
  } while (page <= totalPages);

  for (const query of ENRICHMENT_QUERIES) {
    page = 1;
    totalPages = 1;
    do {
      const result = await fetchPage(page, query);
      totalPages = result.pagination.totalPages;
      const counts = await importResultPage(result.servers, startedAt, seen);
      imported += counts.imported;
      updated += counts.updated;
      console.log(`Imported Smithery search "${query}" page ${page}/${totalPages}`);
      page += 1;
    } while (page <= totalPages);
  }

  const expectedRows = await prisma.mcpServerCatalogItem.findMany({
    where: {
      organizationId: null,
      source: "SMITHERY",
      smitheryServerKey: { in: EXPECTED_QUALIFIED_NAMES },
    },
    select: { smitheryServerKey: true, name: true, mcpUrl: true },
    orderBy: { name: "asc" },
  });
  const importedExpected = new Set(expectedRows.map((row) => row.smitheryServerKey));
  const missingExpected = EXPECTED_QUALIFIED_NAMES.filter((name) => !importedExpected.has(name));
  if (expectedRows.length) {
    console.log("Verified expected Smithery apps:");
    for (const row of expectedRows) {
      console.log(`- ${row.name} (${row.smitheryServerKey}) ${row.mcpUrl}`);
    }
  }
  if (missingExpected.length) {
    console.warn(`Missing expected Smithery apps: ${missingExpected.join(", ")}`);
  }

  console.log(`Smithery catalog import complete. Created ${imported}, updated ${updated}.`);
}

main()
  .catch((err) => {
    console.error("Smithery catalog import failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
