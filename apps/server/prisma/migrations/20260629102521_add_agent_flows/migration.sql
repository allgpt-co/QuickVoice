-- CreateTable
CREATE TABLE "AgentFlow" (
    "flowId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "rootAgentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "graphJson" JSONB NOT NULL,
    "compiledJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentFlow_pkey" PRIMARY KEY ("flowId")
);

-- CreateIndex
CREATE INDEX "AgentFlow_organizationId_idx" ON "AgentFlow"("organizationId");

-- CreateIndex
CREATE INDEX "AgentFlow_rootAgentId_idx" ON "AgentFlow"("rootAgentId");

-- CreateIndex
CREATE INDEX "AgentFlow_organizationId_rootAgentId_isActive_idx" ON "AgentFlow"("organizationId", "rootAgentId", "isActive");

-- CreateIndex
CREATE INDEX "AgentFlow_userId_idx" ON "AgentFlow"("userId");

-- AddForeignKey
ALTER TABLE "AgentFlow" ADD CONSTRAINT "AgentFlow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentFlow" ADD CONSTRAINT "AgentFlow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentFlow" ADD CONSTRAINT "AgentFlow_rootAgentId_fkey" FOREIGN KEY ("rootAgentId") REFERENCES "Agent"("agentId") ON DELETE CASCADE ON UPDATE CASCADE;
