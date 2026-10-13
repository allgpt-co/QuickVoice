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
    type:
      item.type === "text" || item.type === "String"
        ? "string"
        : typeof item.type === "string"
          ? item.type
          : "string",
    name: typeof item.name === "string" ? item.name : "",
    description: typeof item.description === "string" ? item.description : "",
    ...(Array.isArray(item.options)
      ? {
          options: item.options.filter(
            (option): option is string => typeof option === "string",
          ),
        }
      : {}),
  }));
}

function normalizeEvaluations(value: unknown): EvaluationItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    id: typeof item.id === "string" ? item.id : createId(),
    name: typeof item.name === "string" ? item.name : "",
    criteria: typeof item.criteria === "string" ? item.criteria : "",
  }));
}

function snapshot(dataNeeded: DataItem[], evaluations: EvaluationItem[]) {
  return JSON.stringify({ dataNeeded, evaluations });
}

const EMPTY_DATA_ITEM = {
  type: "string",
  name: "",
  description: "",
  options: "",
};

const EMPTY_EVALUATION = {
  name: "",
  criteria: "",
};

export function AnalysisTab({ agentId }: { agentId: string }) {
  const {
    data: config,
    isLoading,
    isError,
    isSuccess,
    refetch,
  } = useAgentConfig(agentId);
  const save = useSaveAgentConfig(agentId);
  const [newDataItem, setNewDataItem] = useState(EMPTY_DATA_ITEM);
  const [newEvaluation, setNewEvaluation] = useState(EMPTY_EVALUATION);
  const [choiceDrafts, setChoiceDrafts] = useState<Record<string, string>>({});
  const savedDataNeeded = useMemo(
    () => normalizeDataNeeded(config?.data_needed),
    [config?.data_needed],
  );
  const savedEvaluations = useMemo(
    () => normalizeEvaluations(config?.data_evaluation),
    [config?.data_evaluation],
  );
  const savedSnapshot = useMemo(
    () => snapshot(savedDataNeeded, savedEvaluations),
    [savedDataNeeded, savedEvaluations],
  );
  const [analysisState, setAnalysisState] = useState(() => ({
    source: savedSnapshot,
    dataNeeded: savedDataNeeded,
    evaluations: savedEvaluations,
  }));

  const isPristine =
    snapshot(analysisState.dataNeeded, analysisState.evaluations) ===
    analysisState.source;
  if (
    analysisState.source !== savedSnapshot &&
    (isPristine ||
      snapshot(analysisState.dataNeeded, analysisState.evaluations) ===
        savedSnapshot)
  ) {
    setAnalysisState({
      source: savedSnapshot,
      dataNeeded: savedDataNeeded,
      evaluations: savedEvaluations,
    });
  }

  const currentAnalysisState =
    analysisState.source === savedSnapshot ||
    (!isPristine &&
      snapshot(analysisState.dataNeeded, analysisState.evaluations) !==
        savedSnapshot)
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
  const setEvaluations = (
    updater: (items: EvaluationItem[]) => EvaluationItem[],
  ) =>
    setAnalysisState((state) => ({
      ...state,
      evaluations: updater(state.evaluations),
    }));
  const currentSnapshot = useMemo(
    () => snapshot(dataNeeded, evaluations),
    [dataNeeded, evaluations],
  );
  const hasChanges = currentSnapshot !== savedSnapshot;
  const hasConflict =
    analysisState.source !== savedSnapshot &&
    !isPristine &&
    currentSnapshot !== savedSnapshot;

  function updateDataItem(id: string, patch: Partial<DataItem>) {
    setDataNeeded((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function updateEvaluation(id: string, patch: Partial<EvaluationItem>) {
    setEvaluations((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function addDataItem() {
    if (!newDataItem.name.trim() || newDataItem.description.trim().length < 5) {
      toast.error("Add a name and description before adding the field");
      return;
    }
    const options = newDataItem.options
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean);
    if (
      newDataItem.type === "choice" &&
      (options.length < 2 ||
        new Set(options.map((option) => option.toLowerCase())).size !==
          options.length)
    ) {
      toast.error("Add at least two distinct comma-separated choices");
      return;
    }
    if (
      dataNeeded.length >= 20 ||
      dataNeeded.some(
        (item) =>
          item.name.toLowerCase() === newDataItem.name.trim().toLowerCase(),
      )
    ) {
      toast.error("Use a unique field name (up to 20 fields)");
      return;
    }
    setDataNeeded((items) => [
      ...items,
      {
        id: createId(),
        type: newDataItem.type,
        name: newDataItem.name.trim(),
        description: newDataItem.description.trim(),
        ...(newDataItem.type === "choice" ? { options } : {}),
      },
    ]);
    setNewDataItem(EMPTY_DATA_ITEM);
  }

  function addEvaluation() {
    if (!newEvaluation.name.trim() || !newEvaluation.criteria.trim()) {
      toast.error("Add a name and criteria before adding the evaluation");
      return;
    }
    if (
      evaluations.length >= 20 ||
      evaluations.some(
        (item) =>
          item.name.toLowerCase() === newEvaluation.name.trim().toLowerCase(),
      )
    ) {
      toast.error("Use a unique check name (up to 20 checks)");
      return;
    }
    setEvaluations((items) => [
      ...items,
      {
        id: createId(),
        name: newEvaluation.name.trim(),
        criteria: newEvaluation.criteria.trim(),
      },
    ]);
    setNewEvaluation(EMPTY_EVALUATION);
  }

  async function saveAnalysis() {
    if (!isSuccess || config === undefined || hasConflict) return;
    try {
      await save.mutateAsync(
        mergeConfig(config, {
          data_needed: dataNeeded,
          data_evaluation: evaluations,
        }),
      );
    } catch {
      // The mutation hook displays the API error; preserve the current state for retry.
    }
  }

  if (isLoading) {
    return <div className="h-96 animate-pulse border bg-card" />;
  }

  if (isError || !isSuccess) {
    return (
      <div role="alert" className="border bg-card p-6 text-sm">
        Could not load analysis settings.{" "}
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="border bg-card p-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Data extraction</h2>
            <p className="text-sm text-muted-foreground">
              Define the structured fields the agent should collect during the
              call.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="size-4" />
            {dataNeeded.length} field{dataNeeded.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="space-y-3">
          {dataNeeded.map((item) => (
            <div
              key={item.id}
              className="grid gap-3 border p-4 lg:grid-cols-[150px_minmax(0,220px)_minmax(0,1fr)_auto]"
            >
              <div className="space-y-2">
                <Label htmlFor={`analysis-type-${item.id}`}>Type</Label>
                <Select
                  value={item.type}
                  onValueChange={(type) => updateDataItem(item.id, { type })}
                >
                  <SelectTrigger id={`analysis-type-${item.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_TYPES.map((type) => (
                      <SelectItem
                        key={type}
                        value={type}
                        className="capitalize"
                      >
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`analysis-name-${item.id}`}>Name</Label>
                <Input
                  id={`analysis-name-${item.id}`}
                  maxLength={100}
                  value={item.name}
                  onChange={(event) =>
                    updateDataItem(item.id, { name: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`analysis-description-${item.id}`}>
                  Description
                </Label>
                <Input
                  id={`analysis-description-${item.id}`}
                  maxLength={500}
                  value={item.description}
                  onChange={(event) =>
                    updateDataItem(item.id, { description: event.target.value })
                  }
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${item.name || "data field"}`}
                  onClick={() =>
                    setDataNeeded((items) =>
                      items.filter((entry) => entry.id !== item.id),
                    )
                  }
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
              {item.type === "choice" && (
                <div className="space-y-2 lg:col-span-3">
                  <Label htmlFor={`analysis-options-${item.id}`}>
                    Choices (comma-separated)
                  </Label>
                  <Input
                    id={`analysis-options-${item.id}`}
                    aria-describedby={
                      !item.options?.length
                        ? `analysis-options-help-${item.id}`
                        : undefined
                    }
                    value={
                      choiceDrafts[item.id] ?? item.options?.join(", ") ?? ""
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      setChoiceDrafts((drafts) => ({
                        ...drafts,
                        [item.id]: value,
                      }));
                      updateDataItem(item.id, {
                        options: value
                          .split(",")
                          .map((option) => option.trim())
                          .filter(Boolean),
                      });
                    }}
                  />
                  {!item.options?.length && (
                    <p
                      id={`analysis-options-help-${item.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      This existing field accepts any text until you add two or
                      more choices.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="grid gap-3 border border-dashed bg-muted/20 p-4 lg:grid-cols-[150px_minmax(0,220px)_minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <Label htmlFor="analysis-new-type">Type</Label>
              <Select
                value={newDataItem.type}
                onValueChange={(type) =>
                  setNewDataItem((item) => ({ ...item, type }))
                }
              >
                <SelectTrigger id="analysis-new-type">
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
              <Label htmlFor="analysis-new-name">Name</Label>
              <Input
                id="analysis-new-name"
                maxLength={100}
                placeholder="customer_name"
                value={newDataItem.name}
                onChange={(event) =>
                  setNewDataItem((item) => ({
                    ...item,
                    name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="analysis-new-description">Description</Label>
              <Input
                id="analysis-new-description"
                maxLength={500}
                placeholder="Customer full name as confirmed on the call"
                value={newDataItem.description}
                onChange={(event) =>
                  setNewDataItem((item) => ({
                    ...item,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={addDataItem}>
                <Plus className="size-4" />
                Add field
              </Button>
            </div>
            {newDataItem.type === "choice" && (
              <div className="space-y-2 lg:col-span-3">
                <Label htmlFor="analysis-new-options">
                  Choices (comma-separated)
                </Label>
                <Input
                  id="analysis-new-options"
                  value={newDataItem.options}
                  maxLength={2000}
                  onChange={(event) =>
                    setNewDataItem((item) => ({
                      ...item,
                      options: event.target.value,
                    }))
                  }
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border bg-card p-6">
        <div className="mb-5 space-y-1">
          <h2 className="text-base font-semibold">Call evaluation</h2>
          <p className="text-sm text-muted-foreground">
            Define checks the agent should evaluate during the call when it has
            enough evidence.
          </p>
        </div>

        <div className="space-y-3">
          {evaluations.map((item) => (
            <div
              key={item.id}
              className="grid gap-3 border p-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto]"
            >
              <div className="space-y-2">
                <Label htmlFor={`analysis-check-name-${item.id}`}>Name</Label>
                <Input
                  id={`analysis-check-name-${item.id}`}
                  maxLength={100}
                  value={item.name}
                  onChange={(event) =>
                    updateEvaluation(item.id, { name: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`analysis-criteria-${item.id}`}>Criteria</Label>
                <Textarea
                  id={`analysis-criteria-${item.id}`}
                  maxLength={500}
                  rows={2}
                  value={item.criteria}
                  onChange={(event) =>
                    updateEvaluation(item.id, { criteria: event.target.value })
                  }
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${item.name || "evaluation"}`}
                  onClick={() =>
                    setEvaluations((items) =>
                      items.filter((entry) => entry.id !== item.id),
                    )
                  }
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          <div className="grid gap-3 border border-dashed bg-muted/20 p-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <Label htmlFor="analysis-new-check-name">Name</Label>
              <Input
                id="analysis-new-check-name"
                maxLength={100}
                placeholder="Identity confirmed"
                value={newEvaluation.name}
                onChange={(event) =>
                  setNewEvaluation((item) => ({
                    ...item,
                    name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="analysis-new-criteria">Criteria</Label>
              <Textarea
                id="analysis-new-criteria"
                maxLength={500}
                rows={2}
                placeholder="Pass when the caller identity was confirmed before sensitive details were discussed."
                value={newEvaluation.criteria}
                onChange={(event) =>
                  setNewEvaluation((item) => ({
                    ...item,
                    criteria: event.target.value,
                  }))
                }
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

      {config?.zero_pii_retention && (
        <p className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Zero PII retention is enabled. Extracted values and evaluation results
          are not saved after the call.
        </p>
      )}
      {hasConflict && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          Analysis settings changed elsewhere. Reload the latest settings before
          saving.{" "}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setChoiceDrafts({});
              setAnalysisState({
                source: savedSnapshot,
                dataNeeded: savedDataNeeded,
                evaluations: savedEvaluations,
              });
            }}
          >
            Reload latest
          </Button>
        </div>
      )}
      <div className="flex justify-end">
        <Button
          onClick={saveAnalysis}
          disabled={save.isPending || !hasChanges || hasConflict}
        >
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save analysis
        </Button>
      </div>
    </div>
  );
}
