import { Router } from "express";
import { requireRole } from "../auth/auth.middleware.js";
import { DeterministicEmbeddingProvider } from "../ai/embedding.provider.js";
import { InMemoryVectorStore } from "../ai/vector.store.js";
import { deleteKnowledge, ingestKnowledge } from "./knowledge.service.js";
import { AppError } from "../common/errors.js";

const embedding = new DeterministicEmbeddingProvider();
const store = new InMemoryVectorStore();
export const knowledgeRouter = Router();
knowledgeRouter.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    if (typeof req.body?.title !== "string" || typeof req.body?.content !== "string" || !req.body.title.trim() || !req.body.content.trim()) {
      throw new AppError(400, "INVALID_REQUEST", "title and content are required");
    }
    res.status(201).json(await ingestKnowledge({ title: req.body.title, content: req.body.content }, embedding, store));
  } catch (error) { next(error); }
});
knowledgeRouter.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id[0];
    await deleteKnowledge(id, store);
    res.status(204).send();
  } catch (error) { next(error); }
});
