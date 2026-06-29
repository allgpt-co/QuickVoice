CREATE UNIQUE INDEX "AgentFlow_active_root_unique" ON "AgentFlow"("organizationId", "rootAgentId") WHERE "isActive" = true;
