import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import { createKnowledge, listKnowledge, removeKnowledge } from "../controllers/knowledge.controller.js";

export const knowledgeRouter = Router();

knowledgeRouter.post("/", requireRole("admin"), createKnowledge);
knowledgeRouter.get("/", requireRole("admin"), listKnowledge);
knowledgeRouter.delete("/:id", requireRole("admin"), removeKnowledge);
