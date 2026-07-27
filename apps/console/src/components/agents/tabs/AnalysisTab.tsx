"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { useAgentConfig, useSaveAgentConfig } from "@/src/hooks/queries/agents";
import { mergeConfig } from "@/src/lib/agents/config-defaults";
import type { ConfigureAgentInput } from "@/src/lib/api/resources/agents";

type DataItem = ConfigureAgentInput["data_needed"][number];
type EvaluationItem = ConfigureAgentInput["data_evaluation"][number];

const DATA_TYPES = ["string", "number", "boolean", "date", "choice"] as const;
const EVALUATION_TYPES = ["deterministic", "probabilistic"] as const;

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeDataNeeded(value: unknown): DataItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    id: typeof item.id === "string" ? item.id : createId(),
    type: typeof item.type === "string" ? item.type : "string",
    name: typeof item.name === "string" ? item.name : "",
    description: typeof item.description === "string" ? item.description : "",
  }));
}

function normalizeEvaluations(value: unknown): EvaluationItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    id: typeof item.id === "string" ? item.id : createId(),
    name: typeof item.name === "string" ? item.name : "",
    criteria: typeof item.criteria === "string" ? item.criteria : "",
    evaluationType:
      item.evaluationType === "probabilistic" ? "probabilistic" : "deterministic",
  }));
}

function snapshot(dataNeeded: DataItem[], evaluations: EvaluationItem[]) {
  return JSON.stringify({ dataNeeded, evaluations });
}

const EMPTY_DATA_ITEM = {
  type: "string",
  name: "",
  description: "",
};

const EMPTY_EVALUATION = {
  name: "",
  criteria: "",
  evaluationType: "deterministic" as const,
};

export function AnalysisTab({ agentId }: { agentId: string }) {
  const { data: config, isLoading } = useAgentConfig(agentId);
  const save = useSaveAgentConfig(agentId);
  const [newDataItem, setNewDataItem] = useState(EMPTY_DATA_ITEM);
  const [newEvaluation, setNewEvaluation] = useState(EMPTY_EVALUATION);
  const savedDataNeeded = useMemo(
    () => normalizeDataNeeded(config?.data_needed),
    [config?.data_needed]
  );
  const savedEvaluations = useMemo(
    () => normalizeEvaluations(config?.data_evaluation),
    [config?.data_evaluation]
  );
  const savedSnapshot = useMemo(
    () => snapshot(savedDataNeeded, savedEvaluations),
    [savedDataNeeded, savedEvaluations]
  );
  const [analysisState, setAnalysisState] = useState(() => ({
    source: savedSnapshot,
    dataNeeded: savedDataNeeded,
    evaluations: savedEvaluations,
  }));

  if (analysisState.source !== savedSnapshot) {
    setAnalysisState({
      source: savedSnapshot,
      dataNeeded: savedDataNeeded,
      evaluations: savedEvaluations,
    });
  }

  const currentAnalysisState =
    analysisState.source === savedSnapshot
      ? analysisState
      : {
          source: savedSnapshot,
          dataNeeded: savedDataNeeded,
          evaluations: savedEvaluations,
        };
  const { dataNeeded, evaluations } = currentAnalysisState;
  const setDataNeeded = (updater: (items: DataItem[]) => DataItem[]) =>
    setAnalysisState((state) => ({
      ...state,
      dataNeeded: updater(state.dataNeeded),
    }));
  const setEvaluations = (updater: (items: EvaluationItem[]) => EvaluationItem[]) =>
    setAnalysisState((state) => ({
      ...state,
      evaluations: updater(state.evaluations),
    }));
  const currentSnapshot = useMemo(
    () => snapshot(dataNeeded, evaluations),
    [dataNeeded, evaluations]
  );
  const hasChanges = currentSnapshot !== savedSnapshot;

  function updateDataItem(id: string, patch: Partial<DataItem>) {
    setDataNeeded((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function updateEvaluation(id: string, patch: Partial<EvaluationItem>) {
    setEvaluations((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function addDataItem() {
    if (!newDataItem.name.trim() || newDataItem.description.trim().length < 5) {
      toast.error("Add a name and description before adding the field");
      return;
    }
    setDataNeeded((items) => [
      ...items,
      {
        id: createId(),
        type: newDataItem.type,
        name: newDataItem.name.trim(),
        description: newDataItem.description.trim(),
      },
    ]);
    setNewDataItem(EMPTY_DATA_ITEM);
  }

  function addEvaluation() {
    if (!newEvaluation.name.trim() || !newEvaluation.criteria.trim()) {
      toast.error("Add a name and criteria before adding the evaluation");
      return;
    }
    setEvaluations((items) => [
      ...items,
      {
        id: createId(),
        name: newEvaluation.name.trim(),
        criteria: newEvaluation.criteria.trim(),
        evaluationType: newEvaluation.evaluationType,
      },
    ]);
    setNewEvaluation(EMPTY_EVALUATION);
  }

  async function saveAnalysis() {
    await save.mutateAsync(
      mergeConfig(config, {
        data_needed: dataNeeded,
        data_evaluation: evaluations,
      })
    );
  }

  if (isLoading) {
    return <div className="h-96 animate-pulse border bg-card" />;
  }

  return (
    <div className="space-y-6">
      <section className="border bg-card p-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Data extraction</h2>
            <p className="text-sm text-muted-foreground">
              Define the structured fields the agent should collect during the call.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="size-4" />
            {dataNeeded.length} field{dataNeeded.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="space-y-3">
          {dataNeeded.map((item) => (
            <div key={item.id} className="grid gap-3 border p-4 lg:grid-cols-[150px_minmax(0,220px)_minmax(0,1fr)_auto]">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={item.type} onValueChange={(type) => updateDataItem(item.id, { type })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_TYPES.map((type) => (
                      <SelectItem key={type} value={type} className="capitalize">
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={item.name}
                  onChange={(event) => updateDataItem(item.id, { name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={item.description}
                  onChange={(event) => updateDataItem(item.id, { description: event.target.value })}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${item.name || "data field"}`}
                  onClick={() => setDataNeeded((items) => items.filter((entry) => entry.id !== item.id))}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          <div className="grid gap-3 border border-dashed bg-muted/20 p-4 lg:grid-cols-[150px_minmax(0,220px)_minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={newDataItem.type}
                onValueChange={(type) => setNewDataItem((item) => ({ ...item, type }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPES.map((type) => (
                    <SelectItem key={type} value={type} className="capitalize">
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="customer_name"
                value={newDataItem.name}
                onChange={(event) => setNewDataItem((item) => ({ ...item, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Customer full name as confirmed on the call"
                value={newDataItem.description}
                onChange={(event) => setNewDataItem((item) => ({ ...item, description: event.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={addDataItem}>
                <Plus className="size-4" />
                Add field
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border bg-card p-6">
        <div className="mb-5 space-y-1">
          <h2 className="text-base font-semibold">Call evaluation</h2>
          <p className="text-sm text-muted-foreground">
            Define quality checks that should be evaluated after a call ends. Mark whether each check is deterministic or AI-judged.
          </p>
        </div>

        <div className="space-y-3">
          {evaluations.map((item) => (
            <div key={item.id} className="grid gap-3 border p-4 lg:grid-cols-[minmax(0,180px)_160px_minmax(0,1fr)_auto]">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={item.name}
                  onChange={(event) => updateEvaluation(item.id, { name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Check type</Label>
                <Select
                  value={item.evaluationType ?? "deterministic"}
                  onValueChange={(evaluationType) =>
                    updateEvaluation(item.id, {
                      evaluationType: evaluationType as EvaluationItem["evaluationType"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVALUATION_TYPES.map((type) => (
                      <SelectItem key={type} value={type} className="capitalize">
                        {type === "probabilistic" ? "AI-judged" : "Deterministic"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Criteria</Label>
                <Textarea
                  rows={2}
                  value={item.criteria}
                  onChange={(event) => updateEvaluation(item.id, { criteria: event.target.value })}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${item.name || "evaluation"}`}
                  onClick={() => setEvaluations((items) => items.filter((entry) => entry.id !== item.id))}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          <div className="grid gap-3 border border-dashed bg-muted/20 p-4 lg:grid-cols-[minmax(0,180px)_160px_minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="Identity confirmed"
                value={newEvaluation.name}
                onChange={(event) => setNewEvaluation((item) => ({ ...item, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Check type</Label>
              <Select
                value={newEvaluation.evaluationType}
                onValueChange={(evaluationType) =>
                  setNewEvaluation((item) => ({
                    ...item,
                    evaluationType: evaluationType as typeof EMPTY_EVALUATION.evaluationType,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVALUATION_TYPES.map((type) => (
                    <SelectItem key={type} value={type} className="capitalize">
                      {type === "probabilistic" ? "AI-judged" : "Deterministic"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Criteria</Label>
              <Textarea
                rows={2}
                placeholder="Pass when the caller identity was confirmed before sensitive details were discussed."
                value={newEvaluation.criteria}
                onChange={(event) => setNewEvaluation((item) => ({ ...item, criteria: event.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={addEvaluation}>
                <Plus className="size-4" />
                Add check
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={saveAnalysis} disabled={save.isPending || !hasChanges}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save analysis
        </Button>
      </div>
    </div>
  );
}
