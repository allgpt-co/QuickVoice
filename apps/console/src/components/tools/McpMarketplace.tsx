"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe2,
  KeyRound,
  Loader2,
  PlugZap,
  Search,
  ShieldCheck,
  Tag,
  Wrench,
} from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { validateCustomMcpUrl } from "@/src/components/tools/custom-mcp-url";
import { useConnectMcp, useMcpCatalog, useOpenMcpSetup } from "@/src/hooks/queries/mcp";
import type { McpCatalogItem } from "@/src/lib/api/types";

const FALLBACK_CATALOG: McpCatalogItem[] = [
  {
    slug: "github",
    name: "GitHub",
    description: "Search repositories, inspect issues, and work with pull requests.",
    provider: "smithery",
    source: "SMITHERY",
    mcpUrl: "https://server.smithery.ai/github",
    smitheryServerKey: "github",
    authType: "oauth",
    categories: ["Developer tools", "Source control"],
    verified: true,
    toolCount: 0,
  },
  {
    slug: "slack",
    name: "Slack",
    description: "Read channels, search messages, and send team updates.",
    provider: "smithery",
    source: "SMITHERY",
    mcpUrl: "https://server.smithery.ai/slack",
    smitheryServerKey: "slack",
    authType: "oauth",
    categories: ["Communication"],
    verified: true,
    toolCount: 0,
  },
  {
    slug: "notion",
    name: "Notion",
    description: "Find pages, read workspace knowledge, and create structured notes.",
    provider: "smithery",
    source: "SMITHERY",
    mcpUrl: "https://server.smithery.ai/notion",
    smitheryServerKey: "notion",
    authType: "oauth",
    categories: ["Knowledge base", "Productivity"],
    verified: true,
    toolCount: 0,
  },
  {
    slug: "google-drive",
    name: "Google Drive",
    description: "Search files, read documents, and retrieve workspace context.",
    provider: "smithery",
    source: "SMITHERY",
    mcpUrl: "https://server.smithery.ai/googledrive",
    smitheryServerKey: "googledrive",
    authType: "oauth",
    categories: ["Knowledge base", "Documents"],
    verified: true,
    toolCount: 0,
  },
];

const hasMissingGoogleDriveScope = (metadata?: Record<string, unknown> | null) =>
  metadata?.scopeIssue === "missing_google_drive_scope";

function AppLogo({ item }: { item: McpCatalogItem }) {
  const [failed, setFailed] = useState(false);
  const iconUrl = item.iconUrl || (typeof item.metadata?.iconUrl === "string" ? item.metadata.iconUrl : null);

  if (iconUrl && !failed) {
    return (
      <Image
        src={iconUrl}
        alt=""
        width={40}
        height={40}
        unoptimized
        className="size-10 shrink-0 border bg-background object-contain p-1"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="flex size-10 shrink-0 items-center justify-center border bg-primary/10 text-sm font-semibold text-primary">
      {item.name.slice(0, 1).toUpperCase() || <Wrench className="size-4" />}
    </div>
  );
}

function MarketplaceAction({
  item,
  isDisabled,
  isPending,
  onConnect,
  onSetup,
}: {
  item: McpCatalogItem;
  isDisabled: boolean;
  isPending: boolean;
  onConnect: () => void;
  onSetup: (setupUrl: string, mcpConnectionId: string) => void;
}) {
  const missingGoogleDriveScope = hasMissingGoogleDriveScope(item.metadata);

  if (missingGoogleDriveScope && item.setupUrl && item.mcpConnectionId) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSetup(item.setupUrl as string, item.mcpConnectionId as string)}
      >
        <ExternalLink className="size-4" />
        Re-authorize
      </Button>
    );
  }

  if (item.connectionStatus === "CONNECTED" || item.connected) {
    return (
      <Badge className="gap-1 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300">
        <CheckCircle2 className="size-3" />
        Connected
      </Badge>
    );
  }

  if (item.connectionStatus === "AUTH_REQUIRED" || item.connectionStatus === "INPUT_REQUIRED") {
    return item.setupUrl && item.mcpConnectionId ? (
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSetup(item.setupUrl as string, item.mcpConnectionId as string)}
      >
        <ExternalLink className="size-4" />
        {missingGoogleDriveScope ? "Re-authorize" : "Setup"}
      </Button>
    ) : (
      <Badge className="gap-1 bg-blue-500/10 text-blue-700 hover:bg-blue-500/10 dark:text-blue-300">
        <AlertCircle className="size-3" />
        {missingGoogleDriveScope ? "Drive access not granted" : "Setup required"}
      </Badge>
    );
  }

  if (item.connectionStatus === "ERROR" || item.connectionStatus === "DISCONNECTED") {
    return (
      <Button variant="outline" size="sm" disabled={isDisabled} onClick={onConnect}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <AlertCircle className="size-4" />}
        Retry setup
      </Button>
    );
  }

  return (
    <Button size="sm" disabled={isDisabled} onClick={onConnect}>
      {isPending ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
      Connect
    </Button>
  );
}

export function McpMarketplace() {
  const connectMcp = useConnectMcp();
  const openMcpSetup = useOpenMcpSetup();
  const [customUrl, setCustomUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [customSetup, setCustomSetup] = useState<{
    setupUrl: string;
    mcpConnectionId: string;
    displayName: string;
  } | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"popular" | "name">("popular");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const catalogParams = {
    page,
    pageSize,
    search: search || undefined,
    verified: verifiedOnly || undefined,
    sort: sortBy,
  };
  const { data, isError, isLoading } = useMcpCatalog(catalogParams);
  const catalog = data?.items.length ? data.items : isError ? FALLBACK_CATALOG : [];
  const pagination = data?.pagination;
  const customUrlValidation = validateCustomMcpUrl(customUrl);
  const isCustomConnectPending =
    connectMcp.isPending && Boolean(connectMcp.variables?.customUrl);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  return (
    <div className="space-y-4">
      <div className="border bg-card">
        <div className="flex items-start justify-between gap-4">
          <div className="p-4">
            <p className="text-sm font-semibold">Connect a custom MCP server</p>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Use this option when a server provider has given you a remote MCP endpoint that is not in the
              verified catalog.
            </p>
          </div>
          <Badge variant="outline" className="m-4 shrink-0">Unverified</Badge>
        </div>

        <div className="border-y bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Before you connect
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="flex gap-3">
              <Globe2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">Remote endpoint</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Use the full public HTTPS endpoint, usually ending in <code>/mcp</code>. Legacy <code>/sse</code>{" "}
                  endpoints are accepted.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">Publicly reachable</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  The server must be reachable from the internet. Localhost and private network URLs are not
                  supported.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">Authorization comes next</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Do not put tokens or passwords in the URL. If the server needs sign-in or setup, you will
                  complete it after connecting.
                </p>
              </div>
            </div>
          </div>
        </div>

        <form
          className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px_auto] lg:items-start"
          onSubmit={(event) => {
            event.preventDefault();
            if (!customUrlValidation.isValid) return;
            connectMcp.mutate(
              {
                customUrl: customUrl.trim(),
                displayName: displayName.trim() || undefined,
              },
              {
                onSuccess: (connection) => {
                  setCustomUrl("");
                  setDisplayName("");
                  setCustomSetup(
                    connection.setupUrl
                      ? {
                          setupUrl: connection.setupUrl,
                          mcpConnectionId: connection.mcpConnectionId,
                          displayName: connection.displayName,
                        }
                      : null
                  );
                },
              }
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="custom-mcp-url">
              MCP endpoint URL <span className="text-destructive">*</span>
            </Label>
            <Input
              id="custom-mcp-url"
              type="url"
              inputMode="url"
              value={customUrl}
              placeholder="https://example.com/mcp"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={customUrl ? !customUrlValidation.isValid : undefined}
              aria-describedby="custom-mcp-url-help custom-mcp-url-status"
              onChange={(event) => {
                setCustomUrl(event.target.value);
                setCustomSetup(null);
              }}
            />
            <p id="custom-mcp-url-help" className="text-xs leading-5 text-muted-foreground">
              Paste the exact endpoint URL, including its <code>/mcp</code> or <code>/sse</code> path.
            </p>
            <p
              id="custom-mcp-url-status"
              role={customUrlValidation.tone === "error" ? "alert" : undefined}
              className={
                customUrlValidation.tone === "error"
                  ? "text-xs leading-5 text-destructive"
                  : customUrlValidation.tone === "success"
                    ? "text-xs leading-5 text-emerald-700 dark:text-emerald-300"
                    : "text-xs leading-5 text-muted-foreground"
              }
            >
              {customUrlValidation.message}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custom-mcp-name">
              Display name <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="custom-mcp-name"
              value={displayName}
              maxLength={100}
              placeholder="Cloudflare demo"
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              This label is shown only inside QuickVoice so your team can recognize the connection. If left
              blank, the server hostname is used.
            </p>
          </div>
          <Button
            type="submit"
            className="lg:mt-6"
            disabled={!customUrlValidation.isValid || connectMcp.isPending}
          >
            {isCustomConnectPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PlugZap className="size-4" />
            )}
            Connect
          </Button>
        </form>

        {customSetup && (
          <div role="status" className="mx-4 mb-4 flex flex-col gap-3 border border-blue-500/30 bg-blue-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <Tag aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue-700 dark:text-blue-300" />
              <div>
                <p className="text-sm font-medium">{customSetup.displayName} needs additional setup</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Continue in a new tab to authorize or configure the server, then return to QuickVoice.
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                openMcpSetup(customSetup.setupUrl, customSetup.mcpConnectionId)
              }
            >
              <ExternalLink className="size-4" />
              Continue setup
            </Button>
          </div>
        )}
      </div>

      {isError && (
        <div className="border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          The API catalog is not available yet. Restart the API server to enable connection actions.
        </div>
      )}

      <div className="flex flex-col gap-3 border bg-card p-4 md:flex-row md:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="mcp-marketplace-search">Search marketplace</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="mcp-marketplace-search"
              value={searchInput}
              className="pl-9"
              placeholder="Search apps, tools, or providers"
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:w-[320px]">
          <Button
            type="button"
            variant={verifiedOnly ? "default" : "outline"}
            onClick={() => {
              setPage(1);
              setVerifiedOnly((value) => !value);
            }}
          >
            <ShieldCheck className="size-4" />
            Verified
          </Button>
          <select
            className="h-9 border bg-background px-3 text-sm"
            value={sortBy}
            onChange={(event) => {
              setPage(1);
              setSortBy(event.target.value as "popular" | "name");
            }}
          >
            <option value="popular">Popular</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {catalog.map((item) => (
          <div key={item.slug} className="border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 gap-3">
                <AppLogo item={item} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.name}</p>
                    {item.verified && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <ShieldCheck className="size-3" />
                        Verified
                      </Badge>
                    )}
                    {!!(item.useCount ?? item.toolCount) && (
                      <Badge variant="secondary" className="text-[10px]">
                        {(item.useCount ?? item.toolCount).toLocaleString()} uses
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                  {item.qualifiedName && (
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/80">
                      {item.qualifiedName}
                    </p>
                  )}
                  {hasMissingGoogleDriveScope(item.metadata) && (
                    <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                      On the Google consent screen, check Google Drive access before continuing.
                    </p>
                  )}
                </div>
              </div>
              <MarketplaceAction
                item={item}
                isDisabled={connectMcp.isPending}
                isPending={
                  connectMcp.isPending &&
                  connectMcp.variables?.catalogSlug === item.slug
                }
                onConnect={() => connectMcp.mutate({ catalogSlug: item.slug })}
                onSetup={openMcpSetup}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {item.categories.map((category) => (
                <Badge key={category} variant="secondary" className="text-[10px]">
                  {category}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
      {!catalog.length && (
        <div className="border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {isLoading ? "Loading MCP servers..." : "No MCP servers match the current filters."}
        </div>
      )}
      {pagination && pagination.totalCount > 0 && (
        <div className="flex flex-col gap-3 border bg-card p-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div>
            Page {pagination.page} of {pagination.totalPages} - {pagination.totalCount.toLocaleString()} results
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 border bg-background px-2 text-sm"
              value={pageSize}
              onChange={(event) => {
                setPage(1);
                setPageSize(Number(event.target.value));
              }}
            >
              <option value={12}>12 / page</option>
              <option value={24}>24 / page</option>
              <option value={48}>48 / page</option>
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isLoading || pagination.page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isLoading || pagination.page >= pagination.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
