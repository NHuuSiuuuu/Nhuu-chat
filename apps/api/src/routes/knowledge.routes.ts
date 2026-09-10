import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import { createKnowledge, removeKnowledge } from "../controllers/knowledge.controller.js";

export const knowledgeRouter = Router();

knowledgeRouter.post("/", requireRole("admin"), createKnowledge);
knowledgeRouter.delete("/:id", requireRole("admin"), removeKnowledge);
