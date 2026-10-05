import { Router } from "express";
import { requireInternalApiKey } from "../../middleware/auth.middleware.js";

type Readiness = {
  ready: boolean;
  requiredIntegrations: string[];
  unknownRequiredIntegrations: string[];
  checks: Record<
    string,
    {
      status: "ok" | "error" | "not_configured";
      message?: string;
      required?: boolean;
    }
  >;
};

export function createReadinessRouter(readReadiness: () => Promise<Readiness>) {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const readiness = await readReadiness();
      res.status(readiness.ready ? 200 : 503).json({
        success: readiness.ready,
        message: readiness.ready ? "Server ready" : "Server not ready",
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/details", requireInternalApiKey, async (_req, res, next) => {
    try {
      const readiness = await readReadiness();
      res.status(readiness.ready ? 200 : 503).json({
        success: readiness.ready,
        message: readiness.ready ? "Server ready" : "Server not ready",
        data: readiness,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
