import { Router, type RequestHandler } from "express";
import multer from "multer";

import { requireRole } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { inboxAccessRoles } from "../auth/inbox-access.js";
import { sendMessage } from "../controllers/messages.controller.js";

export const messageRouter = Router();

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const blockedExtensions = new Set([".exe", ".js", ".sh"]);
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 3, parts: 4, fieldSize: 64 * 1024, fieldNameSize: 100 },
  fileFilter(_request, file, callback) {
    const extension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
    if (blockedExtensions.has(extension) || file.mimetype === "application/x-msdownload" || file.mimetype === "application/javascript" || file.mimetype === "text/x-shellscript") {
      callback(new Error("Dangerous attachment type"));
      return;
    }
    callback(null, true);
  }
});

const receiveAttachment: RequestHandler = (request, response, next) => {
  attachmentUpload.single("attachment")(request, response, (error) => {
    if (error) {
      next(new AppError(400, "INVALID_ATTACHMENT", "Tệp đính kèm không hợp lệ hoặc vượt quá 20 MB"));
      return;
    }
    next();
  });
};

messageRouter.post("/send", requireRole(...inboxAccessRoles), receiveAttachment, sendMessage);
