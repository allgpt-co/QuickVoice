const apiVersion = process.env.API_VERSION || "v1";
const basePath = `/api/${apiVersion}`;

const userAuthSecurity = [{ sessionCookie: [] }, { apiKey: [] }];

const internalAuthSecurity: never[] = [];

const errorResponse = {
  type: "object",
  required: [
    "success",
    "code",
    "message",
    "details",
    "fieldErrors",
    "requestId",
  ],
  properties: {
    success: { type: "boolean", example: false },
    code: { type: "string", example: "VALIDATION_ERROR" },
    message: { type: "string", example: "Validation failed" },
    details: {
      type: "object",
      nullable: true,
      additionalProperties: true,
      example: {
        issues: [
          {
            path: "documents.0.name",
            message: "Document name is required",
            code: "too_small",
          },
        ],
      },
    },
    fieldErrors: {
      type: "object",
      additionalProperties: {
        type: "array",
        items: { type: "string" },
      },
      example: { "documents.0.name": ["Document name is required"] },
    },
    requestId: { type: "string", nullable: true, example: "req_abc123" },
  },
};

const agentTemplateIdSchema = {
  oneOf: [
    { type: "string", enum: ["business", "medical", "blank", "support"] },
    { type: "string", format: "uuid" },
    { type: "null" },
  ],
  nullable: true,
  description:
    "Console template slug, legacy UUID template id, or null for no template.",
  example: "blank",
};

export const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "QuickVoice Server API",
    version: apiVersion,
    description:
      "Interactive API documentation for the QuickVoice Express server.",
  },
  servers: [
    {
      url: basePath,
      description: "Current server",
    },
  ],
  tags: [
    { name: "System" },
    { name: "Auth" },
    { name: "Dashboard" },
    { name: "Agents" },
    { name: "Numbers" },
    { name: "Calls" },
    { name: "Knowledge Base" },
    { name: "Outbound Calls" },
    { name: "Billing" },
    { name: "Tools" },
    { name: "MCP Integrations" },
    { name: "Readiness" },
  ],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
        description:
          "Better Auth session cookie from the console app. In Swagger UI, this is normally sent automatically when you are logged in on the same API origin.",
      },
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description:
          "Organization-scoped QuickVoice API key. Send the raw key in the x-api-key header; do not use Authorization: Bearer for external API keys.",
      },
    },
    schemas: {
      ErrorResponse: errorResponse,
      CreateAgentRequest: {
        type: "object",
        required: ["name", "isActive", "templateId"],
        properties: {
          name: { type: "string", minLength: 2, example: "Reception Agent" },
          isActive: { type: "boolean", example: true },
          templateId: agentTemplateIdSchema,
        },
      },
      UpdateAgentRequest: {
        type: "object",
        minProperties: 1,
        properties: {
          name: { type: "string", minLength: 2 },
          isActive: { type: "boolean" },
          templateId: agentTemplateIdSchema,
        },
      },
      ConfigureAgentRequest: {
        type: "object",
        required: [
          "agent_language",
          "firstMessage",
          "systemPrompt",
          "llmModel",
          "sttModel",
          "ttsModel",
          "use_rag",
          "voiceId",
          "data_needed",
          "data_evaluation",
          "initiation_webhook",
          "post_call_webhook",
          "preemptive_generation",
          "ivr_navigation_enabled",
          "timezone",
        ],
        properties: {
          agent_language: { type: "string", example: "en-US" },
          firstMessage: {
            type: "string",
            example: "Hello, how can I help you today?",
          },
          systemPrompt: {
            type: "string",
            example: "You are a friendly, reliable voice assistant.",
          },
          llmModel: { type: "string", example: "google/gemini-2.5-flash" },
          sttModel: { type: "string", example: "nova-3" },
          ttsModel: { type: "string", example: "aura-2" },
          use_rag: { type: "boolean", example: false },
          voiceId: { type: "string", example: "athena" },
          data_needed: {
            type: "array",
            items: { $ref: "#/components/schemas/DataItem" },
          },
          data_evaluation: {
            type: "array",
            items: { $ref: "#/components/schemas/DataEvaluation" },
          },
          initiation_webhook: {
            nullable: true,
            example: null,
            allOf: [{ $ref: "#/components/schemas/InitiationWebhook" }],
          },
          post_call_webhook: {
            nullable: true,
            example: null,
            allOf: [{ $ref: "#/components/schemas/PostCallWebhook" }],
          },
          variables: { $ref: "#/components/schemas/AgentVariables" },
          preemptive_generation: { type: "boolean", example: true },
          ivr_navigation_enabled: { type: "boolean", example: true },
          timezone: { type: "string", example: "Asia/Calcutta" },
          store_call_audio: { type: "boolean", default: true },
          zero_pii_retention: { type: "boolean", default: false },
          conversation_retention_days: {
            type: "integer",
            minimum: 1,
            maximum: 3650,
            default: 30,
          },
        },
        example: {
          agent_language: "en-US",
          firstMessage: "Hello, how can I help you today?",
          systemPrompt:
            "You are a friendly, reliable voice assistant for handling customer calls.",
          llmModel: "google/gemini-2.5-flash",
          sttModel: "nova-3",
          ttsModel: "aura-2",
          use_rag: false,
          voiceId: "athena",
          data_needed: [],
          data_evaluation: [],
          initiation_webhook: null,
          post_call_webhook: null,
          variables: {
            firstMessage: [],
            systemPrompt: [],
            placeholders: {},
          },
          preemptive_generation: true,
          ivr_navigation_enabled: true,
          timezone: "Asia/Calcutta",
          store_call_audio: true,
          zero_pii_retention: false,
          conversation_retention_days: 30,
        },
      },
      DataItem: {
        type: "object",
        required: ["id", "type", "name", "description"],
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
        },
      },
      DataEvaluation: {
        type: "object",
        required: ["id", "name", "criteria"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          criteria: { type: "string" },
        },
      },
      SecretValueMap: {
        type: "object",
        additionalProperties: {
          type: "object",
          required: ["value", "type"],
          properties: {
            value: { type: "string" },
            type: { type: "string", enum: ["Value", "Secret"] },
          },
        },
      },
      InitiationWebhook: {
        type: "object",
        required: ["webhook_url", "method"],
        properties: {
          webhook_url: {
            type: "string",
            format: "uri",
            example: "https://example.com/api/voice/initiation",
          },
          method: { type: "string", enum: ["POST", "GET"], example: "POST" },
          dynamic_variables: {
            type: "object",
            additionalProperties: { type: "string" },
            example: {},
          },
          headers: { $ref: "#/components/schemas/SecretValueMap" },
          body: { $ref: "#/components/schemas/SecretValueMap" },
        },
      },
      PostCallWebhook: {
        type: "object",
        required: ["webhook_url", "method", "transcript", "audio_url"],
        properties: {
          webhook_url: {
            type: "string",
            format: "uri",
            example: "https://example.com/api/voice/post-call",
          },
          method: { type: "string", enum: ["POST"], example: "POST" },
          headers: { $ref: "#/components/schemas/SecretValueMap" },
          transcript: { type: "boolean", example: true },
          audio_url: { type: "boolean", example: true },
        },
      },
      AgentVariables: {
        type: "object",
        properties: {
          firstMessage: { type: "array", items: { type: "string" } },
          systemPrompt: { type: "array", items: { type: "string" } },
          placeholders: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
      },
      BuyNumberRequest: {
        type: "object",
        required: ["provider", "phoneNumber"],
        properties: {
          provider: {
            type: "string",
            enum: ["TWILIO", "TELNYX"],
            description:
              "Telephony provider. Lowercase values are accepted and normalized.",
          },
          phoneNumber: { type: "string", example: "+14155551234" },
        },
      },
      UpdateNumberRequest: {
        type: "object",
        required: ["agentId"],
        properties: {
          agentId: { type: "string", format: "uuid", nullable: true },
        },
      },
      CreateKbRequest: {
        type: "object",
        required: ["agentId", "documents"],
        properties: {
          agentId: { type: "string", format: "uuid" },
          documents: {
            type: "array",
            minItems: 1,
            items: { $ref: "#/components/schemas/KbDocument" },
          },
        },
      },
      UpdateKbRequest: {
        type: "object",
        minProperties: 1,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 200 },
          agentId: { type: "string", format: "uuid" },
          url: {
            type: "string",
            format: "uri",
            description: "Editable only for URL knowledge sources.",
          },
        },
      },
      KbDocument: {
        type: "object",
        required: ["name", "sourceType"],
        properties: {
          name: { type: "string", example: "Pricing FAQ" },
          sourceType: {
            type: "string",
            enum: ["PDF", "TXT", "CSV", "DOCX", "XLSX", "XLS", "URL"],
          },
          url: { type: "string", format: "uri", nullable: true },
          s3Key: { type: "string", nullable: true },
          originalFileName: { type: "string", nullable: true },
        },
      },
      KbJobMetadata: {
        type: "object",
        properties: {
          jobId: {
            type: "string",
            description: "BullMQ job identifier for support correlation.",
          },
          processorJobId: {
            type: "string",
            description: "Downstream AI processing job identifier.",
          },
          stage: {
            type: "string",
            example: "extracting",
          },
          progress: {
            type: "object",
            properties: {
              processed: { type: "integer", minimum: 0 },
              total: { type: "integer", minimum: 0 },
              percent: { type: "number", minimum: 0, maximum: 100 },
            },
          },
          failureReason: { type: "string" },
          retryable: { type: "boolean" },
          retryCount: { type: "integer", minimum: 0 },
          retryOfJobId: { type: "string" },
        },
      },
      CallLogRequest: {
        type: "object",
        required: [
          "organizationId",
          "agentId",
          "callId",
          "startTime",
          "endTime",
          "direction",
          "durationSeconds",
          "status",
          "recordingSid",
          "transcripts",
          "toNumber",
          "fromNumber",
          "provider",
        ],
        properties: {
          organizationId: { type: "string" },
          userId: { type: "string" },
          agentId: { type: "string", format: "uuid" },
          callId: { type: "string" },
          startTime: { type: "string", format: "date-time" },
          endTime: { type: "string", format: "date-time" },
          direction: { type: "string", enum: ["inbound", "outbound"] },
          durationSeconds: { type: "number" },
          status: {
            type: "string",
            description: "CallStatus enum from Prisma.",
          },
          metadata: {
            type: "object",
            properties: {
              summary: { type: "string" },
              intent: { type: "string" },
              outboundId: { type: "string", format: "uuid", nullable: true },
            },
          },
          recordingSid: { type: "string" },
          transcripts: {
            type: "array",
            items: { $ref: "#/components/schemas/Transcript" },
          },
          toNumber: { type: "string" },
          fromNumber: { type: "string" },
          provider: { type: "string", enum: ["TWILIO", "TELNYX"] },
          extractedData: {
            type: "array",
            items: { $ref: "#/components/schemas/ExtractedData" },
          },
          evaluatedData: {
            type: "array",
            items: { $ref: "#/components/schemas/EvaluatedData" },
          },
        },
      },
      Transcript: {
        type: "object",
        required: ["messageId", "role", "message", "timestamp"],
        properties: {
          messageId: { type: "string" },
          role: { type: "string", enum: ["user", "agent"] },
          message: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      ExtractedData: {
        type: "object",
        required: ["type", "name", "description", "value"],
        properties: {
          type: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          value: { nullable: true },
        },
      },
      EvaluatedData: {
        type: "object",
        required: ["identifier", "description", "value"],
        properties: {
          identifier: { type: "string" },
          description: { type: "string" },
          value: { nullable: true },
        },
      },
      KbUploadUrlResponse: {
        type: "object",
        required: [
          "uploadUrl",
          "s3Key",
          "sourceType",
          "contentType",
          "maxUploadBytes",
        ],
        properties: {
          uploadUrl: { type: "string", format: "uri" },
          s3Key: { type: "string", example: "kb/org_123/file.pdf" },
          sourceType: {
            type: "string",
            enum: ["PDF", "TXT", "CSV", "DOCX", "XLSX", "XLS"],
          },
          contentType: { type: "string", example: "application/pdf" },
          maxUploadBytes: { type: "integer", example: 10485760 },
        },
      },
      BatchUploadUrlResponse: {
        type: "object",
        required: ["uploadUrl", "s3Key", "contentType", "maxUploadBytes"],
        properties: {
          uploadUrl: { type: "string", format: "uri" },
          s3Key: {
            type: "string",
            example: "outbound-batches/org_123/file.csv",
          },
          contentType: { type: "string", example: "text/csv" },
          maxUploadBytes: { type: "integer", example: 5242880 },
        },
      },
      QuickOutboundCallRequest: {
        type: "object",
        required: ["agentId", "phoneNumber", "fromNumber"],
        properties: {
          agentId: { type: "string", format: "uuid" },
          phoneNumber: { type: "string", example: "+15550001111" },
          fromNumber: { type: "string", example: "+15551230000" },
          firstMessage: {
            type: "string",
            example: "Hi, this is QuickVoice calling back.",
          },
          systemPrompt: {
            type: "string",
            example: "Keep the call concise and helpful.",
          },
          username: { type: "string", example: "Ada" },
          provider: { type: "string", enum: ["TWILIO", "TELNYX"] },
          sid: {
            type: "string",
            description: "Optional provider number SID override.",
          },
        },
      },
      CancelOutboundCallRequest: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            maxLength: 500,
            example: "Customer requested cancellation",
          },
        },
      },
      OutboundCall: {
        type: "object",
        properties: {
          outboundId: { type: "string", format: "uuid" },
          organizationId: { type: "string" },
          agentId: { type: "string", format: "uuid", nullable: true },
          userId: { type: "string", nullable: true },
          campaignId: { type: "string", nullable: true },
          callLogId: { type: "string", nullable: true },
          phoneNumber: { type: "string", example: "+15550001111" },
          fromNumber: { type: "string", example: "+15551230000" },
          mode: { type: "string", enum: ["quick", "campaign"] },
          status: {
            type: "string",
            enum: [
              "NOT_ANSWERED",
              "SCHEDULED",
              "PROCESSED",
              "IN_PROGRESS",
              "COMPLETED",
              "FAILED",
            ],
          },
          failureReason: {
            type: "string",
            nullable: true,
            example: "LiveKit unavailable",
          },
          cancellationReason: { type: "string", nullable: true },
          scheduledAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          callLog: { type: "object", nullable: true },
        },
      },
      OutboundCallListResponse: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/OutboundCall" },
          },
          count: { type: "integer", example: 1 },
          filters: { type: "object", additionalProperties: true },
          nextCursor: { type: "string", nullable: true },
        },
      },
      OutboundCallStatus: {
        type: "object",
        properties: {
          outboundId: { type: "string", format: "uuid" },
          status: { type: "string" },
          failureReason: { type: "string", nullable: true },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateBatchCampaignRequest: {
        type: "object",
        required: [
          "name",
          "agentId",
          "fromNumber",
          "sourceFileKey",
          "sourceFileName",
        ],
        properties: {
          name: { type: "string", example: "Renewal reminders" },
          agentId: { type: "string", format: "uuid" },
          fromNumber: { type: "string", example: "+15551230000" },
          sourceFileKey: {
            type: "string",
            example: "outbound-batches/org_123/file.csv",
          },
          sourceFileName: { type: "string", example: "renewals.csv" },
          scheduledAt: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          timezone: { type: "string", default: "UTC" },
          ringingTimeoutSeconds: {
            type: "integer",
            minimum: 10,
            maximum: 180,
            default: 60,
          },
        },
      },
      BatchCampaign: {
        type: "object",
        additionalProperties: true,
        properties: {
          campaignId: { type: "string", format: "uuid" },
          name: { type: "string" },
          agentId: { type: "string", format: "uuid" },
          status: {
            type: "string",
            enum: [
              "SCHEDULED",
              "ACTIVE",
              "COMPLETED",
              "CANCELLED",
              "PROCESSED",
              "FAILED",
            ],
          },
          totalRecipients: { type: "integer" },
          validRecipients: { type: "integer" },
          invalidRecipients: { type: "integer" },
          scheduledAt: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
        },
      },
      BillingUsage: {
        type: "object",
        required: [
          "plan",
          "periodStart",
          "periodEnd",
          "usedMinutes",
          "usedSeconds",
          "overageMinutes",
          "callCount",
        ],
        properties: {
          plan: { type: "string", example: "starter" },
          subscriptionStatus: {
            type: "string",
            nullable: true,
            example: "active",
          },
          periodStart: { type: "string", format: "date-time" },
          periodEnd: { type: "string", format: "date-time" },
          includedMinutes: { type: "integer", nullable: true },
          usedMinutes: { type: "integer" },
          usedSeconds: { type: "integer" },
          remainingMinutes: { type: "integer", nullable: true },
          overageMinutes: { type: "integer" },
          percentUsed: { type: "number", nullable: true },
          callCount: { type: "integer" },
        },
      },
      ToolRequest: {
        type: "object",
        required: ["name", "description", "api_url"],
        properties: {
          name: { type: "string", example: "Lookup order" },
          description: {
            type: "string",
            example: "Fetch order status for a caller.",
          },
          api_url: {
            type: "string",
            format: "uri",
            example: "https://api.example.com/orders",
          },
          api_method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            default: "POST",
          },
          api_headers: {
            type: "array",
            items: { type: "object" },
            nullable: true,
          },
          api_body: {
            type: "array",
            items: { type: "object" },
            nullable: true,
          },
          api_query_params: {
            type: "array",
            items: { type: "object" },
            nullable: true,
          },
          api_path_params: {
            type: "array",
            items: { type: "object" },
            nullable: true,
          },
          response_timeout_secs: {
            type: "integer",
            minimum: 1,
            maximum: 300,
            nullable: true,
          },
          dynamic_variables: {
            type: "array",
            items: { type: "object" },
            nullable: true,
          },
          disable_interruptions: { type: "boolean", default: false },
          force_pre_tool_speech: { type: "boolean", default: true },
        },
      },
      Tool: {
        type: "object",
        additionalProperties: true,
        properties: {
          toolId: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: "string" },
          api_url: { type: "string", format: "uri" },
        },
      },
      McpConnectionRequest: {
        type: "object",
        properties: {
          catalogSlug: {
            type: "string",
            example: "smithery/slack",
            description:
              "Connect a catalog server. Provide either catalogSlug or customUrl.",
          },
          customUrl: {
            type: "string",
            format: "uri",
            example: "https://mcp.example.com/sse",
            description:
              "Connect a custom MCP server. Provide either catalogSlug or customUrl.",
          },
          displayName: { type: "string", example: "Slack workspace" },
        },
      },
      McpConnection: {
        type: "object",
        additionalProperties: true,
        properties: {
          mcpConnectionId: { type: "string", format: "uuid" },
          status: {
            type: "string",
            enum: [
              "PENDING",
              "CONNECTED",
              "AUTH_REQUIRED",
              "INPUT_REQUIRED",
              "ERROR",
              "DISCONNECTED",
            ],
          },
          setupUrl: { type: "string", format: "uri", nullable: true },
        },
      },
      AttachMcpRequest: {
        type: "object",
        properties: {
          enabled: { type: "boolean", default: true },
        },
      },
      ExecuteMcpToolRequest: {
        type: "object",
        properties: {
          agentId: { type: "string", format: "uuid" },
          callId: { type: "string" },
          arguments: { type: "object", additionalProperties: true },
        },
      },
      DashboardSummary: {
        type: "object",
        properties: {
          range: { type: "string", enum: ["24h", "7d", "30d"] },
          period: {
            type: "object",
            properties: {
              from: { type: "string", format: "date-time" },
              to: { type: "string", format: "date-time" },
              previousFrom: { type: "string", format: "date-time" },
              previousTo: { type: "string", format: "date-time" },
            },
          },
          totals: {
            type: "object",
            properties: {
              calls: { type: "number" },
              minutes: { type: "number" },
              avgDurationSeconds: { type: "number" },
              successRate: { type: "number" },
              failedCalls: { type: "number" },
              missedCalls: { type: "number" },
            },
          },
          deltas: {
            type: "object",
            additionalProperties: { type: "number" },
          },
          series: { type: "array", items: { type: "object" } },
          statusBreakdown: { type: "array", items: { type: "object" } },
          directionBreakdown: { type: "array", items: { type: "object" } },
          topAgents: { type: "array", items: { type: "object" } },
          recent: { type: "array", items: { type: "object" } },
        },
      },
    },
    responses: {
      BadRequest: {
        description: "Bad request",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      Unauthorized: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      Forbidden: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      NotFound: {
        description: "Not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: {
          200: { description: "Server is running" },
        },
      },
    },
    "/ready": {
      get: {
        tags: ["Readiness"],
        summary: "Readiness and integration diagnostics",
        description:
          "Returns core dependency and optional integration checks so operators can tell whether the API is usable and which integrations need attention.",
        responses: {
          200: { description: "Core server dependencies are ready" },
          503: {
            description:
              "One or more required core dependencies are unavailable",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    data: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/me": {
      get: {
        tags: ["Auth"],
        summary: "Verify authenticated access",
        security: userAuthSecurity,
        responses: {
          200: { description: "Authenticated user can access the API" },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/dashboard/summary": {
      get: {
        tags: ["Dashboard"],
        summary: "Get dashboard analytics summary",
        security: userAuthSecurity,
        parameters: [
          {
            name: "range",
            in: "query",
            schema: {
              type: "string",
              enum: ["24h", "7d", "30d", "custom"],
              default: "7d",
            },
          },
          {
            name: "from",
            in: "query",
            description: "Required when range is custom. Inclusive start date.",
            schema: { type: "string", format: "date" },
          },
          {
            name: "to",
            in: "query",
            description: "Required when range is custom. Inclusive end date.",
            schema: { type: "string", format: "date" },
          },
        ],
        responses: {
          200: {
            description: "Dashboard analytics summary",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DashboardSummary" },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/agents": {
      get: {
        tags: ["Agents"],
        summary: "List agents",
        security: userAuthSecurity,
        responses: {
          200: { description: "Agent list" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Agents"],
        summary: "Create an agent",
        security: userAuthSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateAgentRequest" },
            },
          },
        },
        responses: {
          201: { description: "Agent created" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/agents/{id}": {
      patch: {
        tags: ["Agents"],
        summary: "Update an agent",
        security: userAuthSecurity,
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateAgentRequest" },
            },
          },
        },
        responses: {
          200: { description: "Agent updated" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Agents"],
        summary: "Delete an agent and its external resources",
        description:
          "Unlinks provider phone numbers, deletes knowledge assets and agent-scoped secrets, then removes the agent.",
        security: userAuthSecurity,
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Agent deleted" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/agents/{agentId}/config": {
      get: {
        tags: ["Agents"],
        summary: "Get agent configuration",
        security: userAuthSecurity,
        parameters: [
          {
            name: "agentId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Agent configuration" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Agents"],
        summary: "Create or update agent configuration",
        security: userAuthSecurity,
        parameters: [
          {
            name: "agentId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ConfigureAgentRequest" },
              example: {
                agent_language: "en-US",
                firstMessage: "Hello, how can I help you today?",
                systemPrompt:
                  "You are a friendly, reliable voice assistant for handling customer calls.",
                llmModel: "google/gemini-2.5-flash",
                sttModel: "nova-3",
                ttsModel: "aura-2",
                use_rag: false,
                voiceId: "athena",
                data_needed: [],
                data_evaluation: [],
                initiation_webhook: null,
                post_call_webhook: null,
                variables: {
                  firstMessage: [],
                  systemPrompt: [],
                  placeholders: {},
                },
                preemptive_generation: true,
                timezone: "Asia/Calcutta",
                store_call_audio: true,
                zero_pii_retention: false,
                conversation_retention_days: 30,
              },
            },
          },
        },
        responses: {
          200: { description: "Agent configuration saved" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/numbers/search": {
      get: {
        tags: ["Numbers"],
        summary: "Search available phone numbers",
        security: userAuthSecurity,
        parameters: [
          {
            name: "provider",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["TWILIO", "TELNYX"] },
            description:
              "Telephony provider. Lowercase values are accepted and normalized.",
          },
          {
            name: "country",
            in: "query",
            required: true,
            schema: { type: "string", example: "US" },
          },
          { name: "areaCode", in: "query", schema: { type: "integer" } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", maximum: 50 },
          },
        ],
        responses: {
          200: { description: "Available numbers" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/numbers": {
      get: {
        tags: ["Numbers"],
        summary: "List owned phone numbers",
        security: userAuthSecurity,
        responses: {
          200: { description: "Phone number list" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Numbers"],
        summary: "Buy a phone number",
        security: userAuthSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BuyNumberRequest" },
            },
          },
        },
        responses: {
          201: { description: "Phone number purchased" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/numbers/{phId}": {
      patch: {
        tags: ["Numbers"],
        summary: "Assign or unassign a phone number",
        security: userAuthSecurity,
        parameters: [
          {
            name: "phId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateNumberRequest" },
            },
          },
        },
        responses: {
          200: { description: "Phone number updated" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      delete: {
        tags: ["Numbers"],
        summary: "Release a phone number",
        security: userAuthSecurity,
        parameters: [
          {
            name: "phId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Phone number released" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/calls": {
      get: {
        tags: ["Calls"],
        summary: "List call logs",
        security: userAuthSecurity,
        parameters: [
          {
            name: "agentId",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          { name: "status", in: "query", schema: { type: "string" } },
          {
            name: "direction",
            in: "query",
            schema: { type: "string", enum: ["inbound", "outbound"] },
          },
          {
            name: "from",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "to",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", maximum: 100, default: 20 },
          },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Call log list" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Calls"],
        summary: "Ingest a completed call log",
        description:
          "Internal-only endpoint for trusted server-to-server call ingestion. Repeating the same callId for the same organization is idempotent.",
        security: internalAuthSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CallLogRequest" },
            },
          },
        },
        responses: {
          201: { description: "Call log ingested" },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/calls/{callId}": {
      get: {
        tags: ["Calls"],
        summary: "Get a call log",
        security: userAuthSecurity,
        parameters: [
          {
            name: "callId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Call log" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Calls"],
        summary: "Delete a call log",
        security: userAuthSecurity,
        parameters: [
          {
            name: "callId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Call log deleted" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/calls/{callId}/transcripts": {
      get: {
        tags: ["Calls"],
        summary: "List call transcripts",
        security: userAuthSecurity,
        parameters: [
          {
            name: "callId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", maximum: 100, default: 50 },
          },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Transcript list" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/kb": {
      get: {
        tags: ["Knowledge Base"],
        summary: "List knowledge sources",
        description:
          "Poll this endpoint while a source is PROCESSING. Job stage, progress, identifiers, and terminal failure reasons are returned in source metadata.",
        security: userAuthSecurity,
        parameters: [
          {
            name: "agentId",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Knowledge source list" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Knowledge Base"],
        summary: "Create knowledge sources",
        security: userAuthSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateKbRequest" },
            },
          },
        },
        responses: {
          201: { description: "Knowledge sources created" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/kb/upload-url": {
      get: {
        tags: ["Knowledge Base"],
        summary: "Generate a direct Knowledge Base upload URL",
        description:
          "Use this before creating non-URL knowledge sources: request upload URL, upload file to S3, then create the source with the returned s3Key and poll /kb.",
        security: userAuthSecurity,
        parameters: [
          {
            name: "fileName",
            in: "query",
            required: true,
            schema: { type: "string", example: "pricing.pdf" },
          },
          {
            name: "contentType",
            in: "query",
            required: true,
            schema: { type: "string", example: "application/pdf" },
          },
          {
            name: "fileSize",
            in: "query",
            required: true,
            schema: { type: "integer", minimum: 1, example: 245760 },
          },
        ],
        responses: {
          200: {
            description: "Presigned upload URL",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/KbUploadUrlResponse" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/kb/{kbId}": {
      patch: {
        tags: ["Knowledge Base"],
        summary: "Update and reprocess a knowledge source",
        description:
          "Updates supported source configuration. Name or agent changes reprocess any source; URL changes are supported for URL sources only.",
        security: userAuthSecurity,
        parameters: [{ name: "kbId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateKbRequest" },
            },
          },
        },
        responses: {
          200: { description: "Knowledge source updated and queued for processing" },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Knowledge Base"],
        summary: "Delete a knowledge source",
        security: userAuthSecurity,
        parameters: [
          {
            name: "kbId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Knowledge source deleted" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/kb/{kbId}/retry": {
      post: {
        tags: ["Knowledge Base"],
        summary: "Retry a failed knowledge source",
        description:
          "Atomically transitions an ERROR source to PROCESSING and enqueues a new ingestion job. Sources already queued or active are rejected.",
        security: userAuthSecurity,
        parameters: [
          {
            name: "kbId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          202: { description: "Knowledge source queued for retry" },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/outbound-calls": {
      get: {
        tags: ["Outbound Calls"],
        summary: "List outbound calls",
        security: userAuthSecurity,
        parameters: [
          {
            name: "agentId",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: [
                "NOT_ANSWERED",
                "SCHEDULED",
                "PROCESSED",
                "IN_PROGRESS",
                "COMPLETED",
                "FAILED",
              ],
            },
          },
          {
            name: "mode",
            in: "query",
            schema: { type: "string", enum: ["quick", "campaign"] },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description:
              "Outbound call list with count, filters, and next cursor",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/OutboundCallListResponse",
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/outbound-calls/quick": {
      post: {
        tags: ["Outbound Calls"],
        summary: "Dispatch a quick outbound call",
        security: userAuthSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/QuickOutboundCallRequest" },
            },
          },
        },
        responses: {
          201: { description: "Outbound call dispatched" },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/outbound-calls/batch-upload-url": {
      get: {
        tags: ["Outbound Calls"],
        summary: "Generate a direct batch-file upload URL",
        description:
          "Accepts CSV or XLSX. The signed PUT requires the exact canonical content type and byte length returned by this request.",
        security: userAuthSecurity,
        parameters: [
          {
            name: "fileName",
            in: "query",
            required: true,
            schema: { type: "string", example: "recipients.csv" },
          },
          {
            name: "contentType",
            in: "query",
            required: true,
            schema: { type: "string", example: "text/csv" },
          },
          {
            name: "fileSize",
            in: "query",
            required: true,
            schema: { type: "integer", minimum: 1, example: 8192 },
          },
        ],
        responses: {
          200: {
            description: "Presigned batch upload URL",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/BatchUploadUrlResponse",
                },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/outbound-calls/batches": {
      get: {
        tags: ["Outbound Calls"],
        summary: "List batch campaigns",
        security: userAuthSecurity,
        parameters: [
          {
            name: "agentId",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: {
            description: "Batch campaign list",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/BatchCampaign" },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Outbound Calls"],
        summary: "Create a batch campaign",
        security: userAuthSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateBatchCampaignRequest",
              },
            },
          },
        },
        responses: {
          201: { description: "Batch campaign created" },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/outbound-calls/batches/{campaignId}": {
      get: {
        tags: ["Outbound Calls"],
        summary: "Get batch campaign details and recipients",
        security: userAuthSecurity,
        parameters: [
          {
            name: "campaignId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: {
            description: "Batch campaign details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BatchCampaign" },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/outbound-calls/{outboundId}": {
      get: {
        tags: ["Outbound Calls"],
        summary: "Get outbound call detail",
        security: userAuthSecurity,
        parameters: [
          {
            name: "outboundId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Outbound call detail",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OutboundCall" },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/outbound-calls/{outboundId}/status": {
      get: {
        tags: ["Outbound Calls"],
        summary: "Get compact outbound call status for polling",
        security: userAuthSecurity,
        parameters: [
          {
            name: "outboundId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Outbound call status and failure reason",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OutboundCallStatus" },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/outbound-calls/{outboundId}/cancel": {
      post: {
        tags: ["Outbound Calls"],
        summary: "Cancel a scheduled outbound call",
        description:
          "Cancels only calls that are still SCHEDULED. In-progress carrier calls cannot be stopped by this endpoint.",
        security: userAuthSecurity,
        parameters: [
          {
            name: "outboundId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CancelOutboundCallRequest",
              },
            },
          },
        },
        responses: {
          200: { description: "Outbound call cancelled" },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/outbound-calls/{outboundId}/retry": {
      post: {
        tags: ["Outbound Calls"],
        summary: "Retry a failed or unanswered outbound call",
        security: userAuthSecurity,
        parameters: [
          {
            name: "outboundId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          201: { description: "Replacement outbound call dispatched" },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/billing/usage": {
      get: {
        tags: ["Billing"],
        summary: "Get current billing-period usage",
        description:
          "Returns call and minute usage for the active subscription period, or the current UTC month when no active subscription period exists.",
        security: userAuthSecurity,
        responses: {
          200: {
            description: "Billing usage",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BillingUsage" },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/tools": {
      get: {
        tags: ["Tools"],
        summary: "List tools",
        security: userAuthSecurity,
        responses: {
          200: { description: "Tool list" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Tools"],
        summary: "Create a tool",
        security: userAuthSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ToolRequest" },
            },
          },
        },
        responses: {
          201: { description: "Tool created" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/tools/{toolId}": {
      patch: {
        tags: ["Tools"],
        summary: "Update a tool",
        security: userAuthSecurity,
        parameters: [
          {
            name: "toolId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ToolRequest" },
            },
          },
        },
        responses: {
          200: { description: "Tool updated" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Tools"],
        summary: "Delete a tool",
        security: userAuthSecurity,
        parameters: [
          {
            name: "toolId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Tool deleted" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/tools/agent/{agentId}": {
      get: {
        tags: ["Tools"],
        summary: "List tools attached to an agent",
        security: userAuthSecurity,
        parameters: [
          {
            name: "agentId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Agent tools" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/tools/{toolId}/attach/{agentId}": {
      post: {
        tags: ["Tools"],
        summary: "Attach a tool to an agent",
        security: userAuthSecurity,
        parameters: [
          {
            name: "toolId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "agentId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Tool attached" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/tools/{toolId}/detach/{agentId}": {
      delete: {
        tags: ["Tools"],
        summary: "Detach a tool from an agent",
        security: userAuthSecurity,
        parameters: [
          {
            name: "toolId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "agentId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Tool detached" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/mcp/catalog": {
      get: {
        tags: ["MCP Integrations"],
        summary: "List MCP catalog entries",
        security: userAuthSecurity,
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 24 },
          },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "verified", in: "query", schema: { type: "boolean" } },
          {
            name: "sort",
            in: "query",
            schema: { type: "string", enum: ["popular", "name"] },
          },
        ],
        responses: {
          200: { description: "MCP catalog" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/mcp/connections": {
      get: {
        tags: ["MCP Integrations"],
        summary: "List MCP connections",
        security: userAuthSecurity,
        responses: {
          200: { description: "MCP connections" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["MCP Integrations"],
        summary: "Create an MCP connection",
        security: userAuthSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/McpConnectionRequest" },
            },
          },
        },
        responses: {
          201: { description: "MCP connection created" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/mcp/connections/{mcpConnectionId}/refresh": {
      post: {
        tags: ["MCP Integrations"],
        summary: "Refresh an MCP connection",
        security: userAuthSecurity,
        parameters: [
          {
            name: "mcpConnectionId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "MCP connection refreshed" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/mcp/connections/{mcpConnectionId}": {
      delete: {
        tags: ["MCP Integrations"],
        summary: "Disconnect an MCP connection",
        security: userAuthSecurity,
        parameters: [
          {
            name: "mcpConnectionId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "MCP connection disconnected" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/mcp/agent/{agentId}": {
      get: {
        tags: ["MCP Integrations"],
        summary: "List MCP connections attached to an agent",
        security: userAuthSecurity,
        parameters: [
          {
            name: "agentId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Agent MCP connections" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/mcp/connections/{mcpConnectionId}/attach/{agentId}": {
      post: {
        tags: ["MCP Integrations"],
        summary: "Attach an MCP connection to an agent",
        security: userAuthSecurity,
        parameters: [
          {
            name: "mcpConnectionId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "agentId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AttachMcpRequest" },
            },
          },
        },
        responses: {
          200: { description: "MCP connection attached" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/mcp/connections/{mcpConnectionId}/detach/{agentId}": {
      delete: {
        tags: ["MCP Integrations"],
        summary: "Detach an MCP connection from an agent",
        security: userAuthSecurity,
        parameters: [
          {
            name: "mcpConnectionId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "agentId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "MCP connection detached" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/mcp/connections/{mcpConnectionId}/tools/{toolName}/execute": {
      post: {
        tags: ["MCP Integrations"],
        summary: "Execute an MCP tool",
        security: userAuthSecurity,
        parameters: [
          {
            name: "mcpConnectionId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "toolName",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ExecuteMcpToolRequest" },
            },
          },
        },
        responses: {
          200: { description: "MCP tool execution result" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
  },
};
