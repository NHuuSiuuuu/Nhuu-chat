import type { ErrorRequestHandler } from "express";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error?.type === "entity.parse.failed") {
    response.status(400).json({
      error: { code: "INVALID_JSON", message: "Request body must be valid JSON" }
    });
    return;
  }

  if (error?.name === "ValidationError") {
    response.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Request data is invalid" }
    });
    return;
  }

  if (error?.name === "CastError") {
    response.status(400).json({
      error: { code: "INVALID_PARAMETER", message: "Request parameter is invalid" }
    });
    return;
  }

  if (error?.code === 11000) {
    response.status(409).json({
      error: { code: "DUPLICATE_RESOURCE", message: "Resource already exists" }
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    return;
  }

  console.error("Unhandled request error", {
    name: error?.name,
    code: error?.code
  });
  response.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" }
  });
};
