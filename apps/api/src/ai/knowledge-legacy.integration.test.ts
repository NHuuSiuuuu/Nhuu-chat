import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createApp } from "../app.js";
import { KnowledgeChunkModel, KnowledgeDocumentModel } from "../models/knowledge.model.js";
import { issueTokens } from "../services/auth.service.js";
import { startTestDatabase, stopTestDatabase } from "../test/mongo-repl-set.js";
import { hydrateKnowledgeVectorStore, knowledgeEmbedding } from "./knowledge-runtime.js";
import { InMemoryVectorStore } from "./vector.store.js";

process.env.JWT_SECRET ??= "task6-local-jwt-secret-32-characters-minimum";
beforeAll(startTestDatabase, 120_000);
afterAll(stopTestDatabase);

it("quarantines legacy records without deleting them and re-ingests only under the authenticated owner", async () => {
  const legacyId = new mongoose.Types.ObjectId();
  const ownerId = String(new mongoose.Types.ObjectId());
  const foreignId = String(new mongoose.Types.ObjectId());
  const content = "Chính sách đã được chủ cửa hàng xác nhận";
  const embedding = await knowledgeEmbedding.embed(content);
  await KnowledgeDocumentModel.collection.insertOne({ _id: legacyId, title: "Legacy", content, sourceType: "text", status: "ready" });
  await KnowledgeChunkModel.collection.insertOne({ documentId: legacyId, chunkIndex: 0, content, embedding });
  const before = new InMemoryVectorStore();
  await hydrateKnowledgeVectorStore(before);
  expect(await before.search(embedding, 10, { ownerId: "undefined" })).toEqual([]);
  expect(await before.search(embedding, 10, { ownerId })).toEqual([]);
  const { accessToken } = await issueTokens({ id: ownerId, email: "owner@example.com", role: "admin" });
  const response = await request(createApp()).post("/api/v1/knowledge").set("Authorization", `Bearer ${accessToken}`).send({ title: "Re-ingested", content, ownerId: foreignId });
  expect(response.status).toBe(201);
  const after = new InMemoryVectorStore();
  await hydrateKnowledgeVectorStore(after);
  expect(await after.search(embedding, 10, { ownerId })).toEqual([expect.objectContaining({ ownerId, content })]);
  expect(await after.search(embedding, 10, { ownerId: foreignId })).toEqual([]);
  expect(await after.search(embedding, 10, { ownerId: "undefined" })).toEqual([]);
  expect(await KnowledgeDocumentModel.collection.findOne({ _id: legacyId })).toMatchObject({ title: "Legacy", content });
  expect(await KnowledgeChunkModel.countDocuments({ documentId: legacyId })).toBe(1);
});
