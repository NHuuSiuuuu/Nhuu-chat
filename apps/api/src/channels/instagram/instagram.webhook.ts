import { createHmac, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { AppError } from "../../common/errors.js";
import { processInstagramWebhook } from "./instagram-event.service.js";

function safeEqual(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyInstagramWebhookChallenge(query: Record<string, unknown>, verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? process.env.META_WEBHOOK_VERIFY_TOKEN) {
  const supplied = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  if (!verifyToken || query["hub.mode"] !== "subscribe" || typeof supplied !== "string" || typeof challenge !== "string" || !safeEqual(verifyToken, supplied)) {
    throw new AppError(403, "INSTAGRAM_WEBHOOK_VERIFICATION_FAILED", "Instagram webhook verification failed");
  }
  return challenge;
}

export function verifyInstagramSignature(rawBody: Buffer, signature: string | undefined, appSecret = process.env.INSTAGRAM_APP_SECRET): boolean {
  if (!appSecret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeEqual(expected, signature.slice(7).toLowerCase());
}

export const ingestInstagramWebhook: RequestHandler = async (request, response, next) => {
  if (!Buffer.isBuffer(request.body) || !verifyInstagramSignature(request.body, request.header("X-Hub-Signature-256"))) {
    response.sendStatus(process.env.INSTAGRAM_APP_SECRET ? 403 : 503);
    return;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(request.body.toString("utf8"));
  } catch {
    response.status(400).json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } });
    return;
  }
  try {
    await processInstagramWebhook(payload);
    response.sendStatus(200);
  } catch (error) {
    next(error);
  }
};
