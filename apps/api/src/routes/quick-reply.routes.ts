import { Router, type RequestHandler } from "express";
import multer from "multer";

import { requireRole } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import {
  createQuickReply,
  deleteQuickReply,
  listQuickReplies,
  updateQuickReply
} from "../controllers/quick-reply.controller.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter(_request, file, callback) {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("Only image attachments are supported"));
      return;
    }
    callback(null, true);
  }
});

const receiveAttachment: RequestHandler = (request, response, next) => {
  attachmentUpload.single("attachment")(request, response, (error) => {
    if (error) {
      next(new AppError(400, "INVALID_ATTACHMENT", "Attachment must be an image up to 5 MiB"));
      return;
    }
    next();
  });
};

export const quickReplyRouter = Router();

quickReplyRouter.use(requireRole("admin", "agent"));
quickReplyRouter.get("/", listQuickReplies);
quickReplyRouter.post("/", receiveAttachment, createQuickReply);
quickReplyRouter.patch("/:id", receiveAttachment, updateQuickReply);
quickReplyRouter.delete("/:id", deleteQuickReply);
