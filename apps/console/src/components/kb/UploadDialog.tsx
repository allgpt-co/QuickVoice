"use client";

import { useRef, useState } from "react";
import { Loader2, Plus, UploadCloud, Link } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
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
import { useCreateKb } from "@/src/hooks/queries/kb";
import { useAgents } from "@/src/hooks/queries/agents";
import { kbApi } from "@/src/lib/api/resources/kb";
import { authClient } from "@/src/lib/auth-client";
import type { KbSourceType } from "@/src/lib/api/types";

const UNSELECTED = "";

const ACCEPTED_TYPES: Record<string, KbSourceType> = {
  "application/pdf": "PDF",
  "text/plain": "TXT",
  "text/csv": "CSV",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-excel": "XLS",
};

const ACCEPT_STRING = Object.keys(ACCEPTED_TYPES)
  .concat([".pdf", ".txt", ".csv", ".docx", ".xlsx", ".xls"])
  .join(",");

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function UploadDialog({ defaultAgentId }: { defaultAgentId?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"url" | "file">("url");
  const [busy, setBusy] = useState(false);

  // URL tab state
  const [urlName, setUrlName] = useState("");
  const [url, setUrl] = useState("");

  // File tab state
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Shared
  const [agentId, setAgentId] = useState(defaultAgentId ?? UNSELECTED);

  const { data: agents } = useAgents();
  const create = useCreateKb();
  const { data: session } = authClient.useSession();

  function reset() {
    setUrlName(""); setUrl(""); setFile(null); setFileName(""); setAgentId(defaultAgentId ?? UNSELECTED);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit() {
    if (!session?.user || !session.session?.activeOrganizationId) {
      toast.error("Not signed in");
      return;
    }
    const org = session.session.activeOrganizationId;
    const user = session.user.id;

    if (!agentId) { toast.error("Please select an agent"); return; }

    setBusy(true);
    try {
      if (tab === "url") {
        if (!urlName.trim() || !url.trim()) { toast.error("Name and URL are required"); return; }
        await create.mutateAsync({
          organizationId: org, userId: user, agentId: agentId,
          documents: [{ name: urlName.trim(), sourceType: "URL", url: url.trim() }],
        });
      } else {
        if (!file || !fileName.trim()) { toast.error("File and a display name are required"); return; }
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error("File exceeds the 10 MB upload limit");
          return;
        }
        const requestedContentType = file.type || "application/octet-stream";
        // 1. Get presigned upload URL
        const { uploadUrl, s3Key, sourceType, contentType } =
          await kbApi.getUploadUrl(
            file.name,
            requestedContentType,
            file.size,
          );
        // 2. Upload directly to S3
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: file,
        });
        if (!uploadRes.ok) throw new Error(`S3 upload failed: ${uploadRes.status}`);
        // 3. Create KB record (triggers BullMQ processing)
        await create.mutateAsync({
          organizationId: org, userId: user, agentId: agentId,
          documents: [{ name: fileName.trim(), sourceType, s3Key, originalFileName: file.name }],
        });
      }
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button><Plus /> Add document</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a document</DialogTitle>
          <DialogDescription>
            Paste a URL or upload a file to add it as a knowledge source.
          </DialogDescription>
        </DialogHeader>

        {/* tab switcher */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(["url", "file"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "url" ? <Link className="size-3.5" /> : <UploadCloud className="size-3.5" />}
              {t === "url" ? "URL" : "File"}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {tab === "url" ? (
            <>
              <div className="space-y-1.5">
                <Label>Display name</Label>
                <Input placeholder="Q4 pricing FAQ" value={urlName} onChange={(e) => setUrlName(e.target.value)} disabled={busy} />
              </div>
              <div className="space-y-1.5">
                <Label>URL</Label>
                <Input type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>File</Label>
                <div
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/30"
                  onClick={() => fileRef.current?.click()}
                >
                  <UploadCloud className="size-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{file ? file.name : "Click to select a file"}</p>
                    <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, CSV, XLSX, XLS up to 10 MB</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPT_STRING}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setFile(f);
                      if (f && !fileName) setFileName(f.name.replace(/\.[^.]+$/, ""));
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Display name</Label>
                <Input placeholder="Product manual" value={fileName} onChange={(e) => setFileName(e.target.value)} disabled={busy} />
              </div>
            </>
          )}

          {/* agent selector */}
          <div className="space-y-1.5">
            <Label>Agent <span className="text-destructive">*</span></Label>
            {(agents ?? []).length === 0 ? (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                No agents found. Create an agent first before adding knowledge sources.
              </p>
            ) : (
              <Select value={agentId} onValueChange={setAgentId} disabled={busy}>
                <SelectTrigger className={!agentId ? "border-destructive/50" : ""}>
                  <SelectValue placeholder="Select an agent…" />
                </SelectTrigger>
                <SelectContent>
                  {(agents ?? []).map((a) => (
                    <SelectItem key={a.agentId} value={a.agentId}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? <><Loader2 className="animate-spin" /> Processing…</> : "Add document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
