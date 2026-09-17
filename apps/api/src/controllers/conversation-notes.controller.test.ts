import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  listConversationNotes: vi.fn(),
  createConversationNote: vi.fn(),
  updateConversationNote: vi.fn(),
  deleteConversationNote: vi.fn(),
  toggleConversationNotePin: vi.fn()
}));
vi.mock("../services/conversation-note.service.js", () => service);

import { errorHandler } from "../common/errors.js";
import {
  createConversationNote,
  deleteConversationNote,
  listConversationNotes,
  toggleConversationNotePin,
  updateConversationNote
} from "./conversation-notes.controller.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    (request as express.Request & { auth?: unknown }).auth = { id: "agent-1", role: "agent" };
    next();
  });
  app.get("/conversations/:conversationId/notes", listConversationNotes);
  app.post("/conversations/:conversationId/notes", createConversationNote);
  app.patch("/conversations/:conversationId/notes/:noteId", updateConversationNote);
  app.delete("/conversations/:conversationId/notes/:noteId", deleteConversationNote);
  app.patch("/conversations/:conversationId/notes/:noteId/pin", toggleConversationNotePin);
  const captureError: ErrorRequestHandler = (error, req, res, next) => errorHandler(error, req, res, next);
  app.use(captureError);
  return app;
}

describe("conversation note controller", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists notes for a conversation with the authenticated user", async () => {
    service.listConversationNotes.mockResolvedValue({ notes: [] });

    const response = await request(createTestApp()).get("/conversations/conversation-1/notes");

    expect(response.status).toBe(200);
    expect(service.listConversationNotes).toHaveBeenCalledWith("conversation-1", { id: "agent-1", role: "agent" });
  });

  it("validates note content before creating", async () => {
    const response = await request(createTestApp()).post("/conversations/conversation-1/notes").send({ content: "   " });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
    expect(service.createConversationNote).not.toHaveBeenCalled();
  });

  it("routes create, edit, delete, and pin operations", async () => {
    service.createConversationNote.mockResolvedValue({ id: "note-1", content: "Gọi lại khách" });
    service.updateConversationNote.mockResolvedValue({ id: "note-1", content: "Đã gọi lại" });
    service.deleteConversationNote.mockResolvedValue(undefined);
    service.toggleConversationNotePin.mockResolvedValue({ id: "note-1", isPinned: true });
    const app = createTestApp();

    expect((await request(app).post("/conversations/conversation-1/notes").send({ content: "Gọi lại khách" })).status).toBe(201);
    expect((await request(app).patch("/conversations/conversation-1/notes/note-1").send({ content: "Đã gọi lại" })).status).toBe(200);
    expect((await request(app).delete("/conversations/conversation-1/notes/note-1")).status).toBe(204);
    expect((await request(app).patch("/conversations/conversation-1/notes/note-1/pin").send({ isPinned: true })).status).toBe(200);
    expect(service.deleteConversationNote).toHaveBeenCalledWith("conversation-1", "note-1", { id: "agent-1", role: "agent" });
    expect(service.toggleConversationNotePin).toHaveBeenCalledWith("conversation-1", "note-1", true, { id: "agent-1", role: "agent" });
  });
});
