import CustomApiError from "../common/errors/customApiError.js";
import { StatusCodes } from "http-status-codes";
import { Request, Response, NextFunction } from "express";
import { ZodError, type ZodIssue } from "zod";
import { createErrorEnvelope, getRequestId } from "./error-envelope.js";

const GENERIC_ERROR_MESSAGE = "Something went wrong try again later";

const errorMiddleware = (err: Error, req: Request, res: Response, next: NextFunction) => {
  let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  let code = "INTERNAL_SERVER_ERROR";
  let message = GENERIC_ERROR_MESSAGE;
  let details: unknown = null;
  let fieldErrors: Record<string, string[]> = {};

  if (err instanceof CustomApiError) {
    statusCode = err.statusCode;
    code = err.code ?? codeFromStatus(statusCode);
    message = err.message;
    details = err.details ?? null;
  }

  if (err instanceof ZodError) {
    statusCode = StatusCodes.BAD_REQUEST;
    code = "VALIDATION_ERROR";
    message = "Validation failed";
    fieldErrors = toFieldErrors(err.issues);
    details = {
      issues: err.issues.map((issue) => ({
        path: issue.path.join(".") || "_root",
        message: issue.message,
        code: issue.code,
      })),
    };
  }

  if (isPayloadTooLargeError(err)) {
    statusCode = StatusCodes.REQUEST_TOO_LONG;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body is too large";
  }

  if ((err as Error & { type?: string }).type === "entity.parse.failed") {
    statusCode = StatusCodes.BAD_REQUEST;
    code = "INVALID_JSON";
    message = "Request body must contain valid JSON";
  }

  if (statusCode >= 500) {
    const errorCode = (err as Error & { code?: unknown }).code;
    // Preserve diagnostic codes and source locations, never request bodies,
    // headers or exception messages that may contain credentials or PHI.
    console.error("[api] request failed", {
      requestId: getRequestId(req),
      method: req.method,
      route: req.route?.path,
      errorType: err.name,
      errorCode: typeof errorCode === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(errorCode)
        ? errorCode : undefined,
      frames: err.stack?.split("\n").filter((line) => /^\s+at /.test(line)).slice(0, 6),
    });
  }

  return res.status(statusCode).json(
    createErrorEnvelope({
      code,
      message,
      details,
      fieldErrors,
      requestId: getRequestId(req),
    })
  );
}

function toFieldErrors(issues: ZodIssue[]) {
  return issues.reduce<Record<string, string[]>>((errors, issue) => {
    const key = issue.path.join(".") || "_root";
    errors[key] = [...(errors[key] ?? []), issue.message];
    return errors;
  }, {});
}

function codeFromStatus(statusCode: number) {
  switch (statusCode) {
    case StatusCodes.BAD_REQUEST:
      return "BAD_REQUEST";
    case StatusCodes.UNAUTHORIZED:
      return "UNAUTHORIZED";
    case StatusCodes.FORBIDDEN:
      return "FORBIDDEN";
    case StatusCodes.NOT_FOUND:
      return "NOT_FOUND";
    case StatusCodes.TOO_MANY_REQUESTS:
      return "RATE_LIMITED";
    case StatusCodes.PAYMENT_REQUIRED:
      return "PAYMENT_REQUIRED";
    default:
      return "INTERNAL_SERVER_ERROR";
  }
}

function isPayloadTooLargeError(err: Error) {
  const candidate = err as Error & { type?: unknown; status?: unknown };
  return candidate.type === "entity.too.large" || candidate.status === StatusCodes.REQUEST_TOO_LONG;
}

export default errorMiddleware;
