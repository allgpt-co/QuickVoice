export function hasExhaustedKbAttempts(
  attemptsMade: number,
  configuredAttempts: number | undefined,
) {
  return attemptsMade >= (configuredAttempts ?? 1);
}

export function safeKbWorkerFailure(error: Error) {
  const message = error.message.toLowerCase();
  const httpStatus = message.match(/\bhttp(?:\s+status)?\s+(\d{3})\b/)?.[1];

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

  if (httpStatus === "401" || httpStatus === "403") {
    return {
      code: "KB_INTERNAL_AUTH_MISMATCH",
      userMessage:
        "The knowledge processing services could not authenticate. Ask an operator to check INTERNAL_API_KEY parity between the server and ai services.",
      retryable: true,
    };
  }

  if (httpStatus === "503") {
    return {
      code: "KB_AI_SERVICE_UNAVAILABLE",
      userMessage:
        "The AI knowledge processing service is temporarily unavailable. Try again after the service is ready.",
      retryable: true,
    };
  }

  if (
    message.includes("econnrefused") ||
    message.includes("fetch failed") ||
    message.includes("enotfound") ||
    message.includes("eai_again") ||
    message.includes("getaddrinfo") ||
    message.includes("dns failure") ||
    message.includes("name or service not known")
  ) {
    return {
      code: "KB_AI_SERVICE_UNREACHABLE",
      userMessage:
        "The server could not reach the AI knowledge processing service. Ask an operator to check AI_API_URL and confirm the ai service is running.",
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
