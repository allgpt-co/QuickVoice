import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { apiKeyClient } from "@better-auth/api-key/client";
import { organizationClient } from "better-auth/client/plugins";
import { API_VERSION, SERVER_URL } from "@/src/lib/links";

export const authClient = createAuthClient({
  baseURL: SERVER_URL,
  basePath: `/api/${API_VERSION}/auth`,
  plugins: [
    adminClient(),
    apiKeyClient(),
    organizationClient({
      dynamicAccessControl: {
        enabled: true,
      },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
