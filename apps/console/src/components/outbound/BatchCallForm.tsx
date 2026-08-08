"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import {
  Braces,
  CalendarClock,
  Clock,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Settings2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/src/components/common/EmptyState";
import { Badge } from "@/src/components/ui/badge";
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
import { useAgentConfig, useAgents } from "@/src/hooks/queries/agents";
import { useNumbers } from "@/src/hooks/queries/numbers";
import { useCreateBatchCampaign } from "@/src/hooks/queries/outbound";
import {
  type CampaignPersonalizationPreflightRequest,
  type CampaignPersonalizationPreflightResponse,
  type CampaignRecipientValue,
  type CampaignBatchIntelligence,
  outboundApi,
} from "@/src/lib/api/resources/outbound";
import type { Agent, PhoneNumber } from "@/src/lib/api/types";
import {
  batchCampaignSchema,
  buildBatchTemplateCsv,
  buildBatchTemplateHeader,
} from "@/src/models/outbound/campaign";
import {
  normalizeAgentVariables,
  uniqueDynamicVariableNames,
} from "@/src/lib/agents/dynamic-variables";
import {
  PersonalizationFieldBuilder,
  type PersonalizationField,
  fieldsToSchema,
} from "./PersonalizationFieldBuilder";
import {
  ExperimentBuilder,
  type ExperimentData,
  experimentsToDefinition,
} from "./ExperimentBuilder";
import {
  GoalBuilder,
  type GoalData,
  goalsToDefinition,
} from "./GoalBuilder";
import { CSVPreview } from "./CSVPreview";

const ACCEPT_STRING =
  ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_BATCH_UPLOAD_BYTES = 5 * 1024 * 1024;
const PREVIEW_CAMPAIGN_ID = "preview-campaign";
const PREVIEW_MAX_RECIPIENTS = 200;

function asDialableAgents(agents: Agent[], numbers: PhoneNumber[]) {
  return agents
    .filter((agent) => agent.isActive && agent.isConfigured)
    .map((agent) => ({
      ...agent,
      numbers: numbers.filter((number) => number.agentId === agent.agentId),
    }))
    .filter((agent) => agent.numbers.length > 0);
}

function contentTypeFor(file: File) {
  if (file.type) return file.type;
  if (file.name.toLowerCase().endsWith(".csv")) return "text/csv";
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/octet-stream";
}

function templateFileName(agentName: string | undefined) {
  const base = (agentName ?? "quickvoice")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "quickvoice"}-recipients-template.csv`;
}

function normalizeCsvHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

const SERVER_SIDE_SPECIAL_COLUMNS = new Set([
  "phone_number",
  "language",
  "voice_id",
  "first_message",
  "prompt",
  "system_prompt",
  "recipient_key",
  "recipientid",
  "recipient",
]);

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (inQuotes) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char === "\r") {
      if (content[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.trim().length > 0));
}

function resolveRecipientKey(raw: Record<string, string>, phoneNumber: string, rowNumber: number) {
  const explicit = raw.recipient_key ?? raw.recipientId ?? raw.recipientid ?? raw.recipient;
  if (explicit?.trim()) return explicit.trim();
  return phoneNumber || `row_${rowNumber}`;
}

function parseRecipientsFromCsv(file: File, maxRows: number): Promise<CampaignRecipientValue[]> {
  return file
    .text()
    .then((raw) => parseCsvRows(raw.replace(/^\uFEFF/, "")))
    .then((rows) => {
      if (!rows.length) {
        throw new Error("Recipient file is empty");
      }

      const headers = rows[0]!.map(normalizeCsvHeader);
      if (!headers.includes("phone_number")) {
        throw new Error("Recipient file must include phone_number column");
      }

      return rows
        .slice(1, 1 + maxRows)
        .map((row, index) => {
          const rowNumber = index + 2;
          const raw: Record<string, string> = {};
          headers.forEach((header, col) => {
            raw[header] = String(row[col] ?? "").trim();
          });
          const phoneNumber = raw.phone_number?.trim() ?? "";
          const values: Record<string, string> = {};
          for (const [key, value] of Object.entries(raw)) {
            if (SERVER_SIDE_SPECIAL_COLUMNS.has(key)) continue;
            if (value !== "") values[key] = value;
          }

          return {
            recipientKey: resolveRecipientKey(raw, phoneNumber, rowNumber),
            rowNumber,
            values,
          } satisfies CampaignRecipientValue;
        })

    });
}

export function BatchCallForm() {
  const {
    data: agents = [],
    isLoading: agentsLoading,
    refetch: refetchAgents,
  } = useAgents();
  const {
    data: numbers = [],
    isLoading: numbersLoading,
    refetch: refetchNumbers,
  } = useNumbers();
  const createBatch = useCreateBatchCampaign();
  const dialableAgents = useMemo(
    () => asDialableAgents(agents, numbers),
    [agents, numbers],
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const [requestedAgentId, setRequestedAgentId] = useState("");
  const [requestedFromNumber, setRequestedFromNumber] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [scheduleMode, setScheduleMode] = useState<"instant" | "later">(
    "instant",
  );
  const [scheduledAt, setScheduledAt] = useState("");
  const [ringingTimeoutSeconds, setRingingTimeoutSeconds] = useState(60);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdCampaignName, setCreatedCampaignName] = useState<string | null>(
    null,
  );

  // Visual component state
  const [personalizationFields, setPersonalizationFields] = useState<PersonalizationField[]>([]);
  const [templates, setTemplates] = useState<{
    prompt?: string;
    firstMessage?: string;
  }>({});
  const [experiments, setExperiments] = useState<ExperimentData[]>([]);
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [preflightResult, setPreflightResult] = useState<
    CampaignPersonalizationPreflightResponse | null
  >(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const agentId = dialableAgents.some(
    (agent) => agent.agentId === requestedAgentId,
  )
    ? requestedAgentId
    : (dialableAgents[0]?.agentId ?? "");
  const selectedAgent = dialableAgents.find(
    (agent) => agent.agentId === agentId,
  );
  const fromNumber = selectedAgent?.numbers.some(
    (number) => number.number === requestedFromNumber,
  )
    ? requestedFromNumber
    : (selectedAgent?.numbers[0]?.number ?? "");
  const { data: selectedAgentConfig } = useAgentConfig(agentId);
  const selectedAgentVariables = useMemo(
    () => normalizeAgentVariables(selectedAgentConfig?.variables),
    [selectedAgentConfig?.variables],
  );
  const dynamicVariableNames = useMemo(
    () => uniqueDynamicVariableNames(selectedAgentVariables),
    [selectedAgentVariables],
  );
  const templateHeader = useMemo(
    () => buildBatchTemplateHeader(dynamicVariableNames),
    [dynamicVariableNames],
  );
  const templateCsv = useMemo(
    () => buildBatchTemplateCsv(dynamicVariableNames),
    [dynamicVariableNames],
  );

  const isLoading = agentsLoading || numbersLoading;
  const isBusy = createBatch.isPending || isPreflighting;
  const canSubmit =
    Boolean(agentId) &&
    Boolean(fromNumber) &&
    Boolean(name.trim()) &&
    Boolean(file) &&
    !isBusy;

  function refresh() {
    refetchAgents();
    refetchNumbers();
  }

  function selectAgent(nextAgentId: string) {
    setRequestedAgentId(nextAgentId);
    const nextAgent = dialableAgents.find(
      (agent) => agent.agentId === nextAgentId,
    );
    setRequestedFromNumber(nextAgent?.numbers[0]?.number ?? "");
  }

  function resetFileInput() {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function copyHeader() {
    await navigator.clipboard.writeText(templateHeader);
    toast.success("Template header copied");
  }

  function downloadTemplate() {
    const blob = new Blob([templateCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = templateFileName(selectedAgent?.name);
    link.click();
    URL.revokeObjectURL(url);
  }

  function buildCampaignIntelligence(): CampaignBatchIntelligence | undefined {
    const hasPersonalization = personalizationFields.length > 0;
    const hasExperiments = experiments.length > 0;
    const hasGoals = goals.length > 0;

    if (!hasPersonalization && !hasExperiments && !hasGoals) {
      return undefined;
    }

    return {
      personalizationSchema: hasPersonalization
        ? {
            ...fieldsToSchema(personalizationFields),
            templates: {
              ...(templates.prompt && { prompt: templates.prompt }),
              ...(templates.firstMessage && { firstMessage: templates.firstMessage }),
            },
          }
        : undefined,
      experiments: hasExperiments ? experimentsToDefinition(experiments) : [],
      goals: hasGoals ? goalsToDefinition(goals) : [],
    } as CampaignBatchIntelligence;
  }

  async function runPreflight() {
    if (!file) {
      setPreflightError("Select a recipients file first");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setPreflightError("Preflight preview currently supports CSV files only");
      return;
    }

    if (personalizationFields.length === 0) {
      setPreflightError("Add at least one personalization field to run preflight");
      return;
    }

    setPreflightError(null);
    setPreflightResult(null);
    setIsPreflighting(true);

    try {
      const schema = fieldsToSchema(personalizationFields);
      const recipients = await parseRecipientsFromCsv(file, PREVIEW_MAX_RECIPIENTS);
      if (!recipients.length) {
        throw new Error("Could not parse any preview rows from the CSV file");
      }

      const request: CampaignPersonalizationPreflightRequest = {
        schema,
        recipients,
        includeSensitivePreview: false,
      };
      const result = await outboundApi.preflightCampaignPersonalization(
        PREVIEW_CAMPAIGN_ID,
        request,
      );
      setPreflightResult(result);
      toast.success("Personalization preflight completed");
    } catch (error) {
      setPreflightError(
        error instanceof Error ? error.message : "Could not run personalization preflight",
      );
    } finally {
      setIsPreflighting(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setCreatedCampaignName(null);

    const parsed = batchCampaignSchema.safeParse({
      name,
      agentId,
      fromNumber,
      file,
      scheduleMode,
      scheduledAt,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      ringingTimeoutSeconds,
    });

    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Check the batch details",
      );
      return;
    }

    let campaignIntelligence: CampaignBatchIntelligence | undefined;
    try {
      campaignIntelligence = buildCampaignIntelligence();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Could not parse campaign intelligence JSON",
      );
      return;
    }

    try {
      const upload = await outboundApi.getBatchUploadUrl(
        parsed.data.file.name,
        contentTypeFor(parsed.data.file),
        parsed.data.file.size,
      );
      const uploadRes = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": upload.contentType },
        body: parsed.data.file,
      });
      if (!uploadRes.ok) {
        throw new Error(`File upload failed: ${uploadRes.status}`);
      }

      const campaign = await createBatch.mutateAsync({
        name: parsed.data.name,
        agentId: parsed.data.agentId,
        fromNumber: parsed.data.fromNumber,
        sourceFileKey: upload.s3Key,
        sourceFileName: parsed.data.file.name,
        scheduledAt:
          parsed.data.scheduleMode === "later" && parsed.data.scheduledAt
            ? new Date(parsed.data.scheduledAt).toISOString()
            : null,
        timezone: parsed.data.timezone,
        ringingTimeoutSeconds: parsed.data.ringingTimeoutSeconds,
        campaignIntelligence,
      });
      setName("");
      setScheduleMode("instant");
      setScheduledAt("");
      setRingingTimeoutSeconds(60);
      setPersonalizationFields([]);
      setTemplates({});
      setExperiments([]);
      setGoals([]);
      setPreflightResult(null);
      setPreflightError(null);
      resetFileInput();
      setCreatedCampaignName(campaign.name);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not create batch",
      );
    }
  }

  if (isLoading) {
    return <div className="h-[620px] animate-pulse border bg-card" />;
  }

  if (dialableAgents.length === 0) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="No outbound-ready agents"
        description="Configure an active agent and assign a phone number before creating a batch."
        action={
          <Button variant="outline" onClick={refresh}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="border bg-card">
      <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-foreground">
          Batch campaigns
        </h2>
        <Badge variant="outline">CSV or XLSX</Badge>
      </div>

      <div className="grid gap-5 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="batchName">Campaign</Label>
            <Input
              id="batchName"
              placeholder="June renewals"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ringTimeout">Ring timeout</Label>
            <Input
              id="ringTimeout"
              type="number"
              min={10}
              max={180}
              value={ringingTimeoutSeconds}
              onChange={(event) =>
                setRingingTimeoutSeconds(Number(event.target.value))
              }
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="batchAgent">Agent</Label>
            <Select value={agentId} onValueChange={selectAgent}>
              <SelectTrigger id="batchAgent" className="w-full">
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent>
                {dialableAgents.map((agent) => (
                  <SelectItem key={agent.agentId} value={agent.agentId}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="batchFromNumber">From</Label>
            <Select value={fromNumber} onValueChange={setRequestedFromNumber}>
              <SelectTrigger id="batchFromNumber" className="w-full">
                <SelectValue placeholder="Select caller ID" />
              </SelectTrigger>
              <SelectContent>
                {(selectedAgent?.numbers ?? []).map((number) => (
                  <SelectItem key={number.phId} value={number.number}>
                    {number.number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label>Recipient file</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copyHeader}
              >
                <Copy /> Copy header
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={downloadTemplate}
              >
                <Download /> Download CSV
              </Button>
            </div>
          </div>
          <button
            type="button"
            className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 border border-dashed bg-background px-4 py-6 text-center transition-colors hover:border-primary/60 hover:bg-muted/30"
            onClick={() => fileRef.current?.click()}
          >
            <UploadCloud className="size-8 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {file ? file.name : "Select recipient file"}
            </span>
            <span className="max-w-full break-all font-mono text-xs text-muted-foreground">
              {templateHeader}
            </span>
            <span className="text-xs text-muted-foreground">
              language and voice_id can be blank to use the agent defaults. Add
              patient_name and question_1, question_2 columns for
              questionnaires.
            </span>
          </button>
          {dynamicVariableNames.length > 0 ? (
            <div className="border border-dashed bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <Braces className="size-4 text-muted-foreground" />
                Template variables
                <Badge variant="outline">{dynamicVariableNames.length}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {dynamicVariableNames.map((name) => (
                  <Badge key={name} variant="secondary">
                    {`{{${name}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_STRING}
            className="hidden"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              if (selected && selected.size > MAX_BATCH_UPLOAD_BYTES) {
                setFormError("Recipient file exceeds the 5 MB upload limit");
                resetFileInput();
                return;
              }
              setFormError(null);
              setPreflightResult(null);
              setPreflightError(null);
              setFile(selected);
            }}
          />
        </div>

        {/* CSV Preview - Auto-shown when file is uploaded */}
        <CSVPreview file={file} maxRows={10} autoPreview />

        {/* Campaign Intelligence Section */}
        <div className="rounded-lg border bg-card">
          <button
            type="button"
            className="w-full flex items-center justify-between p-4 text-left"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <div className="flex items-center gap-2">
              <Settings2 className="size-4 text-muted-foreground" />
              <div>
                <h3 className="text-sm font-semibold">Campaign Intelligence</h3>
                <p className="text-xs text-muted-foreground">
                  Personalization, A/B testing, and conversion goals
                </p>
              </div>
            </div>
            <Badge variant="outline" className="ml-2">
              {personalizationFields.length + experiments.length + goals.length} configured
            </Badge>
          </button>

          {showAdvanced && (
            <div className="border-t p-4 space-y-6">
              {/* Personalization Fields */}
              <PersonalizationFieldBuilder
                value={personalizationFields}
                onChange={setPersonalizationFields}
                templates={templates}
                onTemplatesChange={setTemplates}
              />

              {/* A/B Testing Experiments */}
              <ExperimentBuilder
                value={experiments}
                onChange={setExperiments}
              />

              {/* Conversion Goals */}
              <GoalBuilder
                value={goals}
                onChange={setGoals}
              />

              {/* Preflight Button */}
              {personalizationFields.length > 0 && (
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Test Personalization</p>
                      <p className="text-xs text-muted-foreground">
                        Verify your fields match the CSV data
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={runPreflight}
                      disabled={isPreflighting || !file}
                    >
                      {isPreflighting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      Run Preflight Check
                    </Button>
                  </div>

                  {preflightError && (
                    <div className="mt-3 p-3 rounded-lg bg-destructive/10 text-sm text-destructive">
                      {preflightError}
                    </div>
                  )}

                  {preflightResult && (
                    <div className="mt-3 p-3 rounded-lg border bg-background">
                      <p className="text-sm font-medium text-emerald-600">
                        ✓ Preflight successful
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Selected: {preflightResult.selectedRecipients} • 
                        Valid: {preflightResult.validRecipients} • 
                        Skipped: {preflightResult.skippedRecipients}
                      </p>
                      {preflightResult.rows.length > 0 && (
                        <div className="mt-2 max-h-40 overflow-auto rounded border bg-muted/30 p-2 text-xs font-mono">
                          {JSON.stringify(preflightResult.rows.slice(0, 5), null, 2)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-3">
          <Label>Schedule</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={scheduleMode === "instant" ? "default" : "outline"}
              onClick={() => setScheduleMode("instant")}
            >
              <Clock /> Instant
            </Button>
            <Button
              type="button"
              variant={scheduleMode === "later" ? "default" : "outline"}
              onClick={() => setScheduleMode("later")}
            >
              <CalendarClock /> Later
            </Button>
          </div>
          {scheduleMode === "later" ? (
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          ) : null}
        </div>

        {formError ? (
          <p className="text-sm text-destructive">{formError}</p>
        ) : null}

        {createdCampaignName ? (
          <div
            aria-live="polite"
            className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            Queued {createdCampaignName}.
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" onClick={refresh}>
            <RefreshCw /> Refresh
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {isBusy ? <Loader2 className="animate-spin" /> : <UploadCloud />}
            Queue batch
          </Button>
        </div>
      </div>
    </form>
  );
}
