import { StatusCodes } from "http-status-codes";
import CustomApiError from "./customApiError.js";

export class PaymentRequiredError extends CustomApiError {
  constructor(
    message = "Insufficient prepaid credit",
    details: Record<string, unknown> = {},
  ) {
    super(message, StatusCodes.PAYMENT_REQUIRED, {
      code: "INSUFFICIENT_CREDIT",
      details,
    });
  }
}
