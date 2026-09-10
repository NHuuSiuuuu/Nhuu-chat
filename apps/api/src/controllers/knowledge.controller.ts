import type { RequestHandler } from "express";

import { DeterministicEmbeddingProvider } from "../ai/embedding.provider.js";
import { InMemoryVectorStore } from "../ai/vector.store.js";
import { AppError } from "../common/errors.js";
import { knowledgeIdSchema, knowledgeInputSchema } from "../schemas/knowledge.schemas.js";
import { deleteKnowledge, ingestKnowledge } from "../services/knowledge.service.js";

const embedding = new DeterministicEmbeddingProvider();
const store = new InMemoryVectorStore();

export const createKnowledge: RequestHandler = async (request, response, next) => {
  try {
    const result = knowledgeInputSchema.safeParse(request.body);
    if (!result.success) {
      throw new AppError(400, "INVALID_REQUEST", "title and content are required");
    }

    response.status(201).json(await ingestKnowledge(result.data, embedding, store));
  } catch (error) {
    next(error);
  }
};

export const removeKnowledge: RequestHandler = async (request, response, next) => {
  try {
    const result = knowledgeIdSchema.safeParse(request.params);
    if (!result.success) {
      throw new AppError(400, "INVALID_REQUEST", "Knowledge id is required");
    }

    await deleteKnowledge(result.data.id, store);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};
