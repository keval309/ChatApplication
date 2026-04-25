import { NextFunction, Request, Response } from "express";
import { RequestExtended } from "../interfaces/global";
import { logger } from "./logger";
import { ErrorCodes } from "./response";
import { invalidText } from "./utils";

interface AppError extends Error {
  status?: number;
  code?: number;
  errorDescription?: string;
}

export const customError = (
  err: AppError,
  req: RequestExtended,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) => {
  if (res.headersSent) return;

  const logMessage = `${new Date().toISOString()} ${req.logId} ${
    req.method
  } ${req.originalUrl} - ${err.message}`;

  req.error ? req.error(logMessage) : logger.error(logMessage);

  // Normalize error
  const normalizedError = normalizeError(err);

  logger.error(
    `Request failed | UserId: ${req?.user?.id} | Status: ${normalizedError.status}`,
    normalizedError,
  );

  return res.status(normalizedError.status).json({
    error:
      normalizedError.status === 500
        ? { description: normalizedError.message }
        : normalizedError,
    message:
      normalizedError.status === 500
        ? "Something went wrong"
        : normalizedError.message,
    responseStatus: normalizedError.status,
  });
};

/**
 * Normalize all errors in one place
 */
function normalizeError(error: AppError) {
  let status = error.status || 500;
  let message = error.message || "Internal Server Error";
  let errorDescription = error.errorDescription;

  // Handle DB invalid syntax
  if (message.includes("invalid input syntax")) {
    return {
      ...ErrorCodes.BAD_REQUEST,
      status: 400,
      message,
      errorDescription: message,
    };
  }

  // Handle JWT Errors
  if (
    message === "invalid token" ||
    message === "jwt malformed" ||
    error.name === "JsonWebTokenError"
  ) {
    status = 401;
    message = "Invalid token format. Please provide a valid JWT.";
  }

  if (error.name === "TokenExpiredError") {
    status = 401;
    message = "Your session has been timed out, please login again.";
  }

  if (invalidText(status)) {
    status = 500;
  }

  return {
    status,
    message: message.trim(),
    errorDescription: errorDescription?.trim(),
  };
}

// 404 Handler
export const notFound = (req: Request, _res: Response, next: NextFunction) => {
  next({
    status: 404,
    message: "Path not found",
  });
};

export class ApiException extends Error {
  status?: number;
  code?: number;
  errorDescription?: string;

  constructor({
    status,
    code,
    message,
    errorDescription,
    error,
  }: {
    status?: number;
    code?: number;
    message?: string;
    errorDescription?: string;
    error?: any;
  }) {
    super(message);

    if (!status && !code && !message && !errorDescription && !error) {
      throw new Error("ApiException must have at least one parameter");
    }

    if (error) {
      logger.error(error?.toJSON ? error.toJSON() : error);
    }

    this.status = status ?? 500;
    this.code = code;
    this.errorDescription = errorDescription ?? message;
  }
}

export default ApiException;
