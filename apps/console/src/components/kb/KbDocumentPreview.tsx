"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Download, Loader2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { kbApi } from "@/src/lib/api/resources/kb";
import type { KnowledgeSource } from "@/src/lib/api/types";
import { downloadBlobAsFile } from "@/src/lib/export-csv";

export function KbDocumentPreview({ source, fileName, onBack }: {
  source: KnowledgeSource;
  fileName: string;
  onBack: () => void;
}) {
  const [document, setDocument] = useState<{ blob: Blob; url?: string; text?: string; truncated?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    kbApi.file(source.kbId, "inline", controller.signal).then(async (blob) => {
      if (controller.signal.aborted) return;
      if (source.sourceType === "PDF") {
        // Force the expected type rather than trusting object metadata or sniffing uploaded HTML.
        objectUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        setDocument({ blob, url: objectUrl });
      } else {
        const maxPreviewBytes = 200_000;
        const text = await blob.slice(0, maxPreviewBytes).text();
        if (!controller.signal.aborted) {
          setDocument({ blob, text, truncated: blob.size > maxPreviewBytes });
        }
      }
    }).catch(() => {
      if (!controller.signal.aborted) setError("Could not load this document. Please try again.");
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source.kbId, source.sourceType, attempt]);

  return (
    <DialogContent className="flex h-[calc(100dvh-2rem)] min-h-0 w-[calc(100vw_-_2rem)] max-w-none flex-col gap-4 overflow-hidden sm:max-w-5xl motion-reduce:animate-none [&>[data-slot=dialog-close]]:size-11">
      <DialogHeader className="min-w-0 pr-10">
        <DialogTitle className="break-words leading-6">{fileName}</DialogTitle>
        <DialogDescription>Document preview · {source.sourceType}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> Back to details
        </Button>
        <Button type="button" className="min-h-11" disabled={!document} onClick={() => {
          if (document) downloadBlobAsFile(fileName, document.blob);
        }}>
          <Download aria-hidden="true" /> Download file
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto border bg-muted/20">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <p role="alert">{error}</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => {
              setError(null);
              setAttempt((value) => value + 1);
            }}>Try again</Button>
          </div>
        ) : !document ? (
          <div className="flex h-full items-center justify-center gap-2 p-6" role="status">
            <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> Loading document…
          </div>
        ) : document.url ? (
          <iframe className="h-full w-full border-0" title={`PDF preview: ${fileName}`} src={document.url} />
        ) : (
          <pre tabIndex={0} aria-label="Document contents" className="min-h-full whitespace-pre-wrap break-words p-4 font-mono text-sm leading-6 sm:p-6">
            {document.text}
          </pre>
        )}
      </div>
      {document?.truncated ? (
        <p className="text-sm text-muted-foreground" role="status">Showing the first 200 KB. Download the file to read the full document.</p>
      ) : source.sourceType === "PDF" ? (
        <p className="text-sm text-muted-foreground">If your browser cannot display this PDF, download it to open in a PDF reader.</p>
      ) : null}
    </DialogContent>
  );
}
