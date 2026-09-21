import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  start: vi.fn(),
  finish: vi.fn(),
  getSelection: vi.fn(),
  select: vi.fn()
}));

vi.mock("../services/facebook-page.service.js", () => ({
  facebookPageService: serviceMocks
}));

vi.mock("../services/facebook-oauth.service.js", () => ({
  facebookOAuthService: serviceMocks
}));

import { connectFacebookPage, finishFacebookOAuth, getFacebookPage, listFacebookOAuthPages, removeFacebookPage, selectFacebookOAuthPage, startFacebookOAuth } from "./facebook-page.controller.js";

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

  it("starts OAuth for the authenticated user and redirects callback without exposing tokens", async () => {
    serviceMocks.start.mockResolvedValue({ authorizationUrl: "https://www.facebook.com/v26.0/dialog/oauth?state=state-1" });
    const startResponse = responseRecorder();
    await startFacebookOAuth({ auth: { id: "user-1" } } as never, startResponse.response as never, vi.fn());
    expect(serviceMocks.start).toHaveBeenCalledWith("user-1");
    expect(startResponse.state.body).toEqual({ authorizationUrl: "https://www.facebook.com/v26.0/dialog/oauth?state=state-1" });

    process.env.WEB_APP_URL = "https://app.example.com";
    serviceMocks.finish.mockResolvedValue({ userId: "user-1", selectionToken: "selection-1", pages: [{ id: "page-1", name: "Page One", canPublish: true }] });
    const redirectResponse = {
      redirect: vi.fn()
    };
    await finishFacebookOAuth({ query: { state: "state-1", code: "code-1" } } as never, redirectResponse as never, vi.fn());
    expect(redirectResponse.redirect).toHaveBeenCalledWith(302, "https://app.example.com/dashboard?facebook_oauth=select&selection=selection-1");
  });

  it("uses the authenticated owner when listing and selecting an OAuth Page", async () => {
    serviceMocks.getSelection.mockResolvedValue([{ id: "page-1", name: "Page One", canPublish: true }]);
    const listResponse = responseRecorder();
    await listFacebookOAuthPages({ auth: { id: "user-1" }, query: { selection: "selection-1" } } as never, listResponse.response as never, vi.fn());
    expect(serviceMocks.getSelection).toHaveBeenCalledWith("user-1", "selection-1");
    expect(listResponse.state.body).toEqual([{ id: "page-1", name: "Page One", canPublish: true }]);

    serviceMocks.select.mockResolvedValue({ id: "connection-1", pageId: "page-1", status: "connected" });
    const selectResponse = responseRecorder();
    await selectFacebookOAuthPage({ auth: { id: "user-1" }, body: { selectionToken: "selection-1", pageId: "page-1" } } as never, selectResponse.response as never, vi.fn());
    expect(serviceMocks.select).toHaveBeenCalledWith("user-1", "selection-1", "page-1", expect.any(Function));
    expect(selectResponse.state.statusCode).toBe(201);
  });
});
