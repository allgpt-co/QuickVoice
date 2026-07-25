export function hasExhaustedKbAttempts(
  attemptsMade: number,
  configuredAttempts: number | undefined,
) {
  return attemptsMade >= (configuredAttempts ?? 1);
}

export function safeKbWorkerFailure(error: Error) {
  const message = error.message.toLowerCase();

  if (message.includes("did not complete within")) {
    return {
      code: "KB_PROCESSING_TIMEOUT",
      userMessage:
        "Processing took too long to finish. Try uploading the document again. If it keeps timing out, split it into smaller files.",
      retryable: true,
    };
  }

  if (message.includes("download") || message.includes("s3")) {
    return {
      code: "KB_FILE_UNAVAILABLE",
      userMessage:
        "QuickVoice could not read the uploaded file from storage. Upload the file again and keep the browser open until the upload finishes.",
      retryable: true,
    };
  }

  return {
    code: "KB_PROCESSING_UNAVAILABLE",
    userMessage:
      "The knowledge processing service was unavailable. Try uploading the document again. If it still fails, contact your workspace administrator.",
    retryable: true,
  };
}
