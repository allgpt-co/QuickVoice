import { StatusCodes } from "http-status-codes";
import CustomApiError from "./customApiError.js";

export class InternalServerError extends CustomApiError {
  constructor(message: string) {
    super(message, StatusCodes.INTERNAL_SERVER_ERROR);
  }
}
