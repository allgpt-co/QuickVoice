import type { KnowledgeSource } from "@/src/lib/api/types";

export interface KbErrorCopy {
  reason: string;
  guidance: string;
}

export function getKbErrorCopy(
  source: Pick<
    KnowledgeSource,
    "errorCode" | "errorMessage" | "errorRetryable" | "sourceType"
  >,
): KbErrorCopy {
  const reason =
    source.errorMessage?.trim() ||
    "Processing failed before detailed diagnostics were recorded for this document.";

  const guidanceByCode: Record<string, string> = {
    KB_EMPTY_TEXT:
      "Upload a version that contains selectable text. For a scanned PDF, run OCR first, then upload it again.",
    KB_DOWNLOAD_TOO_LARGE:
      "Split or compress the document into smaller files, then upload each file separately.",
    KB_CHUNK_LIMIT_EXCEEDED:
      "Shorten the document or split it into smaller topic-focused files, then upload them again.",
    KB_UNSUPPORTED_FILE_CONTENT_TYPE:
      "Convert the file to PDF, DOCX, TXT, CSV, XLSX, or XLS, then upload the converted file.",
    KB_UNSUPPORTED_URL_CONTENT_TYPE:
      "Use a direct link to a public HTML page instead of a download, image, or media URL.",
    KB_URL_REQUIRED:
      "Enter the complete page URL and add the source again.",
    KB_URL_UNSUPPORTED_SCHEME:
      "Use a URL that begins with http:// or https://.",
    KB_URL_HOST_REQUIRED:
      "Enter a complete URL, including its public host name.",
    KB_URL_CREDENTIALS_NOT_ALLOWED:
      "Remove embedded usernames or passwords from the URL and use a public link.",
    KB_URL_PRIVATE_HOST:
      "Use a publicly accessible URL; local and private-network addresses cannot be indexed.",
    KB_URL_HOST_NOT_ALLOWED:
      "Use a URL from a host allowed by your workspace, or contact your workspace administrator.",
    KB_URL_HOST_UNRESOLVED:
      "Check the URL for typing errors and confirm the page is publicly available, then add it again.",
    KB_TOO_MANY_REDIRECTS:
      "Open the URL in a browser, copy the final destination URL, and add that URL instead.",
    KB_FILE_URL_REQUIRED:
      "Delete this failed entry and upload the file again so QuickVoice can read it.",
    KB_FILE_UNAVAILABLE:
      "Delete this failed entry and upload the file again. Keep the browser open until the upload finishes.",
    KB_PROCESSING_TIMEOUT:
      "Upload the document again. If it times out again, split it into smaller files first.",
    KB_PROCESSING_RESULT_MISSING:
      "Delete this failed entry and upload the document again.",
    KB_VECTOR_STORE_API_KEY_INVALID:
      "Ask your workspace administrator to correct the knowledge-processing configuration, then upload the document again.",
    KB_VECTOR_STORE_API_KEY_MISSING:
      "Ask your workspace administrator to configure knowledge processing, then upload the document again.",
    KB_VECTOR_STORE_HOST_MISSING:
      "Ask your workspace administrator to configure knowledge processing, then upload the document again.",
    KB_PROCESSING_NOT_CONFIGURED:
      "Ask your workspace administrator to configure knowledge processing before uploading again.",
    KB_PROCESSING_UNAVAILABLE:
      "Delete this failed entry and try uploading the document again. If it still fails, contact your workspace administrator.",
  };

  const guidance = source.errorCode
    ? guidanceByCode[source.errorCode]
    : undefined;

  return {
    reason,
    guidance:
      guidance ||
      (source.errorRetryable
        ? "Delete this failed entry and try uploading the document again. If it still fails, contact your workspace administrator."
        : `Check the ${source.sourceType === "URL" ? "URL" : "document"}, correct the issue, and upload it again.`),
  };
}
