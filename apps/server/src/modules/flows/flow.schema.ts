import { z } from "zod";

export const flowNodeTypeSchema = z.enum(["start", "agent", "end"]);
export const flowEdgeTypeSchema = z.enum(["llm_condition", "default"]);

export const flowGraphNodeSchema = z
  .object({
    id: z.string().min(1).max(80),
    type: flowNodeTypeSchema,
    position: z.object({ x: z.number(), y: z.number() }),
    data: z.object({
      label: z.string().min(1).max(120),
      agentId: z.string().uuid().optional(),
      transferMessage: z.string().max(500).optional(),
      enableFirstMessage: z.boolean().optional(),
    }),
  })
  .superRefine((node, ctx) => {
    if ((node.type === "start" || node.type === "agent") && !node.data.agentId) {
      ctx.addIssue({
        code: "custom",
        path: ["data", "agentId"],
        message: "Agent node requires an agentId",
      });
    }
  });

export const flowGraphEdgeSchema = z
  .object({
    id: z.string().min(1).max(120),
    source: z.string().min(1).max(80),
    target: z.string().min(1).max(80),
    type: flowEdgeTypeSchema,
    data: z.object({
      label: z.string().min(1).max(120),
      condition: z.string().min(5).max(1000).optional(),
      priority: z.number().int().min(0).max(1000).default(0),
    }),
  })
  .superRefine((edge, ctx) => {
    if (edge.type === "llm_condition" && !edge.data.condition) {
      ctx.addIssue({
        code: "custom",
        path: ["data", "condition"],
        message: "LLM condition edge requires condition text",
      });
    }
  });

export const flowGraphSchema = z
  .object({
    version: z.literal(1),
    nodes: z.array(flowGraphNodeSchema).min(1).max(50),
    edges: z.array(flowGraphEdgeSchema).max(120),
  })
  .superRefine((graph, ctx) => {
    const startCount = graph.nodes.filter((node) => node.type === "start").length;
    if (startCount !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["nodes"],
        message: "Flow must contain exactly one start node",
      });
    }

    const nodeIds = new Set<string>();
    graph.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["nodes", index, "id"],
          message: "Duplicate node id",
        });
      }
      nodeIds.add(node.id);
    });

    const edgeIds = new Set<string>();
    graph.edges.forEach((edge, index) => {
      if (edgeIds.has(edge.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["edges", index, "id"],
          message: "Duplicate edge id",
        });
      }
      edgeIds.add(edge.id);
    });
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.source)) {
        ctx.addIssue({
          code: "custom",
          path: ["edges"],
          message: `Edge ${edge.id} has unknown source ${edge.source}`,
        });
      }
      if (!nodeIds.has(edge.target)) {
        ctx.addIssue({
          code: "custom",
          path: ["edges"],
          message: `Edge ${edge.id} has unknown target ${edge.target}`,
        });
      }
    }
  });

const flowMutationShape = {
  rootAgentId: z.string().uuid(),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  graphJson: flowGraphSchema,
};

export const listFlowsQuerySchema = z.object({
  rootAgentId: z.string().uuid().optional(),
});

export const createFlowSchema = z.object({
  ...flowMutationShape,
  isActive: z.boolean().default(false),
});

export const updateFlowSchema = z.object({
  rootAgentId: flowMutationShape.rootAgentId.optional(),
  name: flowMutationShape.name.optional(),
  description: flowMutationShape.description.optional(),
  graphJson: flowMutationShape.graphJson.optional(),
  isActive: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  "At least one field must be provided"
);

export const flowTestRunSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(5000),
      })
    )
    .min(1)
    .max(20),
});

export type FlowNodeType = z.infer<typeof flowNodeTypeSchema>;
export type FlowEdgeType = z.infer<typeof flowEdgeTypeSchema>;
export type FlowGraphNode = z.infer<typeof flowGraphNodeSchema>;
export type FlowGraphEdge = z.infer<typeof flowGraphEdgeSchema>;
export type AgentFlowGraph = z.infer<typeof flowGraphSchema>;
export type ListFlowsQuery = z.infer<typeof listFlowsQuerySchema>;
export type CreateFlowInput = z.infer<typeof createFlowSchema>;
export type UpdateFlowInput = z.infer<typeof updateFlowSchema>;
export type FlowTestRunInput = z.infer<typeof flowTestRunSchema>;
