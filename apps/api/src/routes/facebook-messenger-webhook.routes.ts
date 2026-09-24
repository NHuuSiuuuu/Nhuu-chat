import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type RequestHandler } from "express";

import { processMessengerWebhook } from "../channels/facebook-messenger/facebook-messenger.webhook.js";

export const facebookMessengerWebhookRouter = Router();

facebookMessengerWebhookRouter.get("/", (request, response) => {
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const supplied = request.query["hub.verify_token"];
  const challenge = request.query["hub.challenge"];
  if (!token || request.query["hub.mode"] !== "subscribe" || typeof supplied !== "string" || typeof challenge !== "string" || !safeEqual(token, supplied)) {
    response.sendStatus(403);
    return;
  }
  response.status(200).type("text/plain").send(challenge);
});

function safeEqual(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

// Xác thực chữ ký trên byte gốc trước khi đọc JSON hoặc tạo dữ liệu Inbox.
const ingestMessengerWebhook: RequestHandler = async (request, response, next) => {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    response.sendStatus(503);
    return;
  }
  const rawBody = request.body;
  const signature = request.header("X-Hub-Signature-256");
  if (!Buffer.isBuffer(rawBody) || typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    response.sendStatus(403);
    return;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!safeEqual(expected, signature.slice(7).toLowerCase())) {
    response.sendStatus(403);
    return;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    response.status(400).json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } });
    return;
  }
  try {
    await processMessengerWebhook(payload);
    response.sendStatus(200);
  } catch (error) {
    next(error);
  }
};

facebookMessengerWebhookRouter.post("/", ingestMessengerWebhook);
