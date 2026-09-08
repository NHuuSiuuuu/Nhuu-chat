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
  if (error instanceof AppError) {
    response.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    return;
  }

  console.error("Unhandled request error", error);
  response.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" }
  });
};
