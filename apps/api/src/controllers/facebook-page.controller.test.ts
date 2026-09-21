import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  get: vi.fn(),
  remove: vi.fn()
}));

vi.mock("../services/facebook-page.service.js", () => ({
  facebookPageService: serviceMocks
}));

import { connectFacebookPage, getFacebookPage, removeFacebookPage } from "./facebook-page.controller.js";

function responseRecorder() {
  const state: { body?: unknown; statusCode: number } = { statusCode: 200 };
  const response = {
    json(body: unknown) { state.body = body; return response; },
    status(statusCode: number) { state.statusCode = statusCode; return response; },
    send() { return response; }
  };
  return { response, state };
}

describe("Facebook page controller", () => {
  beforeEach(() => vi.resetAllMocks());

  it("connects using only the authenticated user and returns safe metadata", async () => {
    const safe = { id: "connection-1", pageId: "page-123", pageName: "Nhuu Store", status: "connected" };
    serviceMocks.connect.mockResolvedValue(safe);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await connectFacebookPage({ auth: { id: "user-1" }, body: { pageId: "page-123", pageAccessToken: "secret" } } as never, response as never, next);

    expect(serviceMocks.connect).toHaveBeenCalledWith("user-1", { pageId: "page-123", pageAccessToken: "secret" });
    expect(state.statusCode).toBe(201);
    expect(state.body).toEqual(safe);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an invalid connection body before calling the service", async () => {
    const { response } = responseRecorder();
    const next = vi.fn();

    await connectFacebookPage({ auth: { id: "user-1" }, body: { pageId: "", pageAccessToken: "" } } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 400, code: "INVALID_REQUEST" });
    expect(serviceMocks.connect).not.toHaveBeenCalled();
  });

  it("gets and deletes only the authenticated user's connection", async () => {
    const safe = { id: "connection-1", pageId: "page-123", status: "connected" };
    serviceMocks.get.mockResolvedValue(safe);
    const getResponse = responseRecorder();
    await getFacebookPage({ auth: { id: "user-1" } } as never, getResponse.response as never, vi.fn());
    expect(serviceMocks.get).toHaveBeenCalledWith("user-1");
    expect(getResponse.state.body).toEqual(safe);

    const deleteResponse = responseRecorder();
    const next = vi.fn();
    await removeFacebookPage({ auth: { id: "user-1" } } as never, deleteResponse.response as never, next);
    expect(serviceMocks.remove).toHaveBeenCalledWith("user-1");
    expect(deleteResponse.state.statusCode).toBe(204);
    expect(next).not.toHaveBeenCalled();
  });
});
