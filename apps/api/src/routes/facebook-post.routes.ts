import { Router, type RequestHandler } from "express";
import multer from "multer";

import { requireRole } from "../auth/auth.middleware.js";
import { resolveWorkspaceContext } from "../auth/workspace.middleware.js";
import { AppError } from "../common/errors.js";
import { cancelFacebookPost, createFacebookPost, listFacebookPosts, retryFacebookPost, updateFacebookPost } from "../controllers/facebook-post.controller.js";

const postUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 3, parts: 5, fieldSize: 64 * 1024, fieldNameSize: 100 },
  fileFilter(_request, file, callback) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) { callback(new Error("Unsupported image type")); return; }
    callback(null, true);
  }
});

const receivePostImage: RequestHandler = (request, response, next) => {
  postUpload.single("image")(request, response, (error) => {
    if (error) { next(new AppError(400, "INVALID_ATTACHMENT", "Post image must be JPEG, PNG, or WebP up to 5 MiB")); return; }
    next();
  });
};

export const facebookPostRouter = Router();
facebookPostRouter.use(requireRole("admin", "agent", "customer"), resolveWorkspaceContext);
facebookPostRouter.get("/", listFacebookPosts);
facebookPostRouter.post("/", receivePostImage, createFacebookPost);
facebookPostRouter.patch("/:id", receivePostImage, updateFacebookPost);
facebookPostRouter.post("/:id/retry", retryFacebookPost);
facebookPostRouter.delete("/:id", cancelFacebookPost);
