import { Router } from "express";
import { AppError } from "../common/errors.js";
import { ingestInstagramWebhook, verifyInstagramWebhookChallenge } from "../channels/instagram/instagram.webhook.js";

export const instagramWebhookRouter = Router();
instagramWebhookRouter.get("/", (request, response, next) => {
  try { response.status(200).type("text/plain").send(verifyInstagramWebhookChallenge(request.query)); }
  catch (error) { if (error instanceof AppError && error.statusCode === 403) { response.sendStatus(403); return; } next(error); }
});
instagramWebhookRouter.post("/", ingestInstagramWebhook);
