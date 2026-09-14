import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import {
  createAssistant,
  deleteAssistant,
  listAssistants,
  updateAssistant
} from "../controllers/assistant.controller.js";
import { previewAssistant } from "../controllers/assistant-preview.controller.js";
import {
  createAutomationTemplate,
  deleteAutomationTemplate,
  listAutomationTemplates,
  updateAutomationTemplate
} from "../controllers/automation-template.controller.js";

export const assistantRouter = Router();

assistantRouter.use(requireRole("admin", "agent"));
assistantRouter.get("/", listAssistants);
assistantRouter.post("/", createAssistant);
assistantRouter.post("/:assistantId/preview", previewAssistant);
assistantRouter.patch("/:assistantId", updateAssistant);
assistantRouter.delete("/:assistantId", deleteAssistant);
assistantRouter.get("/:assistantId/templates", listAutomationTemplates);
assistantRouter.post("/:assistantId/templates", createAutomationTemplate);
assistantRouter.patch("/:assistantId/templates/:templateId", updateAutomationTemplate);
assistantRouter.delete("/:assistantId/templates/:templateId", deleteAutomationTemplate);
