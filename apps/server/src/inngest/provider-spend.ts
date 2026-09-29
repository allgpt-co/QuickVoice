import { inngest } from "../config/inngest.js";
import { runProviderSpendMonitor } from "../modules/billing/provider-spend.service.js";

export const monitorProviderSpend = inngest.createFunction(
  {
    id: "monitor-provider-spend",
    concurrency: { limit: 1 },
    retries: 2,
    triggers: { cron: "TZ=UTC */5 * * * *" },
  },
  async ({ step }) =>
    step.run("collect-provider-usage-and-notify-team", () =>
      runProviderSpendMonitor(),
    ),
);
