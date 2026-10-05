"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { authClient } from "@/src/lib/auth-client";
import { apiQueryRetryDelay, retryApiQuery } from "@/src/lib/errors";
import { queryCacheIdentity } from "@/src/lib/query-cache";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: retryApiQuery,
        retryDelay: apiQueryRetryDelay,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const identity = queryCacheIdentity(session, isPending);

  return (
    <IdentityQueryProvider key={identity}>{children}</IdentityQueryProvider>
  );
}

function IdentityQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(createQueryClient);

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      ) : null}
    </QueryClientProvider>
  );
}
