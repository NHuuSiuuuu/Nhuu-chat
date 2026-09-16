import type { RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { zaloPersonalStatusSchema, type ZaloPersonalStatus } from "../channels/zalo-personal/zalo-personal.schemas.js";
import { AppError } from "../common/errors.js";
import {
  getZaloPersonalQrStatus,
  getZaloPersonalSessionStatus,
  logoutZaloPersonal,
  startZaloPersonalQr as startQr
} from "../services/zalo-personal.service.js";

// Owner luôn lấy từ JWT đã xác thực để body không thể chuyển quyền điều khiển session.
function authenticatedOwnerId(request: AuthenticatedRequest): string {
  const ownerId = request.auth?.id;
  if (!ownerId) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return ownerId;
}

// QR không có id được xem như không thuộc owner hiện tại, tránh tiết lộ chi tiết request parsing.
function qrLoginId(params: unknown): string {
  const id = (params as { id?: unknown } | undefined)?.id;
  if (typeof id !== "string" || !id) {
    throw new AppError(404, "QR_LOGIN_NOT_FOUND", "QR login was not found");
  }
  return id;
}

// Chỉ cho HTTP trả schema công khai; mọi lỗi adapter lạ được đổi thành mã an toàn, không lộ credentials.
function safeStatus(value: unknown): ZaloPersonalStatus {
  const result = zaloPersonalStatusSchema.safeParse(value);
  if (!result.success) {
    throw new AppError(503, "ZALO_PERSONAL_UNAVAILABLE", "Zalo personal service is temporarily unavailable");
  }
  return result.data;
}

function safeError(error: unknown): AppError {
  return error instanceof AppError
    ? error
    : new AppError(503, "ZALO_PERSONAL_UNAVAILABLE", "Zalo personal service is temporarily unavailable");
}

// Tạo QR chỉ cho owner trong JWT, tuyệt đối không nhận ownerId từ request body.
export const startZaloPersonalQr: RequestHandler = async (request, response, next) => {
  try {
    response.status(201).json(safeStatus(await startQr(authenticatedOwnerId(request))));
  } catch (error) {
    next(safeError(error));
  }
};

// Kiểm tra cả QR id và owner JWT trước khi trả trạng thái QR tạm thời.
export const getZaloPersonalQr: RequestHandler = (request, response, next) => {
  try {
    response.json(safeStatus(getZaloPersonalQrStatus(qrLoginId(request.params), authenticatedOwnerId(request))));
  } catch (error) {
    next(safeError(error));
  }
};

// Status phiên luôn được đọc theo owner JWT và lọc lại qua schema public.
export const getZaloPersonalStatus: RequestHandler = async (request, response, next) => {
  try {
    response.json(safeStatus(await getZaloPersonalSessionStatus(authenticatedOwnerId(request))));
  } catch (error) {
    next(safeError(error));
  }
};

// Logout chỉ tác động listener và credentials của owner trong JWT.
export const logoutZaloPersonalSession: RequestHandler = async (request, response, next) => {
  try {
    await logoutZaloPersonal(authenticatedOwnerId(request));
    response.status(204).send();
  } catch (error) {
    next(safeError(error));
  }
};
