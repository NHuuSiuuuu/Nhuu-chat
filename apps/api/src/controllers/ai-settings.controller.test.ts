import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  getAiSettings: vi.fn(),
  updateAiSettings: vi.fn()
}));

vi.mock("../services/ai-settings.service.js", () => serviceMocks);

import { getAiSettings, updateAiSettings } from "./ai-settings.controller.js";

function responseRecorder() {
  const state: { body?: unknown; statusCode: number } = { statusCode: 200 };
  const response = {
    json(body: unknown) {
      state.body = body;
      return response;
    }
  };
  return { response, state };
}

describe("AI settings controller", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns settings for the authenticated user", async () => {
    const expected = { modelTier: "smart", enabled: true, suggestionsEnabled: true, sentimentEnabled: true, suggestionMode: "on_open", sentimentWindow: 3 };
    serviceMocks.getAiSettings.mockResolvedValue(expected);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await getAiSettings({ auth: { id: "user-1" } } as never, response as never, next);

    expect(serviceMocks.getAiSettings).toHaveBeenCalledWith("user-1");
    expect(state.body).toEqual(expected);
    expect(next).not.toHaveBeenCalled();
  });

  it("validates and persists only supported settings values", async () => {
    const expected = { modelTier: "economy", enabled: false, suggestionsEnabled: false, sentimentEnabled: false, suggestionMode: "manual", sentimentWindow: 10 };
    serviceMocks.updateAiSettings.mockResolvedValue(expected);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await updateAiSettings({ auth: { id: "user-1" }, body: expected } as never, response as never, next);

    expect(serviceMocks.updateAiSettings).toHaveBeenCalledWith("user-1", expected);
    expect(state.body).toEqual(expected);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an unsupported model tier", async () => {
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await updateAiSettings({ auth: { id: "user-1" }, body: { modelTier: "premium" } } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 400, code: "INVALID_REQUEST" });
    expect(state.body).toBeUndefined();
    expect(serviceMocks.updateAiSettings).not.toHaveBeenCalled();
  });
});
