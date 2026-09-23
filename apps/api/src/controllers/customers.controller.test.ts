import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ findByIdAndUpdate: vi.fn(), lean: vi.fn(), exists: vi.fn() }));
vi.mock("../models/customer.model.js", () => ({ CustomerModel: database }));
vi.mock("../models/conversation.model.js", () => ({ ConversationModel: { exists: database.exists } }));

import { errorHandler } from "../common/errors.js";
import { updateCustomerTags } from "./customers.controller.js";

function createTestApp(onError = (_error: unknown) => {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { Object.assign(req, { auth: { id: "staff-1", email: "staff@example.com", role: "customer" }, workspace: { id: "workspace-1", ownerUserId: "owner-1", role: "staff", allowedPages: ["page-1"] } }); next(); });
  app.patch("/customers/:id/tags", updateCustomerTags);
  const captureError: ErrorRequestHandler = (error, req, res, next) => {
    onError(error);
    errorHandler(error, req, res, next);
  };
  app.use(captureError);
  return app;
}

describe("customer controller and service without Mongo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    database.exists.mockResolvedValue(true);
    database.findByIdAndUpdate.mockReturnValue({ lean: database.lean });
  });
  afterEach(() => vi.restoreAllMocks());

  it("trims and deduplicates tags before persistence and returns the updated customer", async () => {
    database.lean.mockResolvedValue({ _id: "customer-1", tags: ["vip", "follow-up"] });
    const response = await request(createTestApp()).patch("/customers/customer-1/tags")
      .send({ tags: [" vip ", "vip", " follow-up", "follow-up "] });

    expect(database.findByIdAndUpdate).toHaveBeenCalledWith(
      "customer-1", { tags: ["vip", "follow-up"] }, { new: true }
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: "customer-1", tags: ["vip", "follow-up"] });
  });

  it("allows clearing every customer tag", async () => {
    database.lean.mockResolvedValue({ _id: "customer-1", tags: [] });
    const response = await request(createTestApp()).patch("/customers/customer-1/tags")
      .send({ tags: [] });

    expect(database.findByIdAndUpdate).toHaveBeenCalledWith("customer-1", { tags: [] }, { new: true });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: "customer-1", tags: [] });
  });

  it("forwards the service's not-found error to the existing HTTP handler", async () => {
    database.lean.mockResolvedValue(null);
    const onError = vi.fn();
    const response = await request(createTestApp(onError)).patch("/customers/missing/tags")
      .send({ tags: ["vip"] });

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ statusCode: 404, code: "CUSTOMER_NOT_FOUND" });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: "CUSTOMER_NOT_FOUND", message: "Customer was not found" }
    });
  });

  it("forwards a persistence failure unchanged through the service and controller", async () => {
    const failure = new Error("database unavailable");
    database.lean.mockRejectedValue(failure);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const response = await request(createTestApp(onError)).patch("/customers/customer-1/tags")
      .send({ tags: ["vip"] });

    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" }
    });
  });

  it("rejects a blank tag without writing to persistence", async () => {
    const response = await request(createTestApp()).patch("/customers/customer-1/tags")
      .send({ tags: ["   "] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
    expect(database.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("does not update customer tags when the customer has no conversation in this Workspace/Page scope", async () => {
    database.exists.mockResolvedValue(false);
    const response = await request(createTestApp()).patch("/customers/customer-1/tags").send({ tags: ["vip"] });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("CUSTOMER_NOT_FOUND");
    expect(database.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
