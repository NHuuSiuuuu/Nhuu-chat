import { describe, expect, it } from "vitest";

import { errorHandler } from "./errors.js";

function responseDouble() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    }
  };
  return response;
}

describe("request error mapping", () => {
  it("maps malformed JSON to a generic 400 response", () => {
    const response = responseDouble();

    errorHandler(
      Object.assign(new Error("Unexpected token passwordHash"), {
        status: 400,
        type: "entity.parse.failed"
      }),
      {} as never,
      response as never,
      (() => undefined) as never
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: { code: "INVALID_JSON", message: "Request body must be valid JSON" }
    });
  });

  it("maps Mongoose validation, cast and duplicate errors without persistence details", () => {
    for (const [error, status, code] of [
      [Object.assign(new Error("User email is required"), { name: "ValidationError" }), 400, "VALIDATION_ERROR"],
      [Object.assign(new Error("Cast to ObjectId failed for value secret"), { name: "CastError" }), 400, "INVALID_PARAMETER"],
      [Object.assign(new Error("duplicate key secret"), { code: 11000 }), 409, "DUPLICATE_RESOURCE"]
    ] as const) {
      const response = responseDouble();
      errorHandler(error, {} as never, response as never, (() => undefined) as never);

      expect(response.statusCode).toBe(status);
      expect(response.body).toEqual({ error: { code, message: expect.any(String) } });
      expect(JSON.stringify(response.body)).not.toContain("secret");
    }
  });
});
