import type { QuickReplyAttachmentContract, QuickReplyContract } from "@nhuu-chat/contracts";

import { AppError } from "../common/errors.js";
import { QuickReplyModel } from "../models/quick-reply.model.js";

const QUICK_REPLY_FOLDER = "nhuu-chat/quick-replies";

type QuickReplyMediaService = Pick<
  import("../media/cloudinary.service.js").CloudinaryMediaService,
  "uploadImage" | "destroyMedia"
>;

let mediaServicePromise: Promise<QuickReplyMediaService> | undefined;

async function quickReplyMediaService(): Promise<QuickReplyMediaService> {
  // Chỉ nạp cấu hình Cloudinary khi request thật sự thao tác với attachment.
  mediaServicePromise ??= import("../media/cloudinary.service.js")
    .then(({ CloudinaryMediaService }) => new CloudinaryMediaService());
  return mediaServicePromise;
}

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface QuickReplyInput {
  shortcut: string;
  message: string;
  attachment?: UploadedFile;
}

export interface QuickReplyUpdateInput {
  shortcut?: string;
  message?: string;
  attachment?: UploadedFile;
}

interface QuickReplyRow {
  _id: unknown;
  shortcut: string;
  message: string;
  attachment?: QuickReplyAttachmentContract | null;
}

function toQuickReply(row: QuickReplyRow): QuickReplyContract {
  return {
    id: String(row._id),
    shortcut: row.shortcut,
    message: row.message,
    ...(row.attachment ? { attachment: {
      secureUrl: row.attachment.secureUrl,
      publicId: row.attachment.publicId,
      resourceType: row.attachment.resourceType,
      mimeType: row.attachment.mimeType,
      bytes: row.attachment.bytes,
      ...(row.attachment.width === undefined ? {} : { width: row.attachment.width }),
      ...(row.attachment.height === undefined ? {} : { height: row.attachment.height }),
      ...(row.attachment.duration === undefined ? {} : { duration: row.attachment.duration })
    } } : {})
  };
}

async function uploadAttachment(userId: string, file: UploadedFile) {
  return (await quickReplyMediaService()).uploadImage({
    buffer: file.buffer,
    filename: file.originalname,
    mimeType: file.mimetype,
    userId,
    folder: QUICK_REPLY_FOLDER
  });
}

async function destroyWithoutBreakingPersistence(
  attachment: QuickReplyAttachmentContract
): Promise<void> {
  try {
    await (await quickReplyMediaService()).destroyMedia(
      attachment.publicId,
      attachment.resourceType
    );
  } catch (error) {
    // Việc dọn media là best-effort sau khi trạng thái MongoDB đã được quyết định.
    console.error("Failed to clean up quick reply media", {
      publicId: attachment.publicId,
      error
    });
  }
}

function notFound(): AppError {
  return new AppError(404, "QUICK_REPLY_NOT_FOUND", "Quick reply was not found");
}

export async function listQuickReplies(
  userId: string
): Promise<{ quickReplies: QuickReplyContract[] }> {
  const rows = await QuickReplyModel.find({ userId })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  return {
    quickReplies: rows.map((row) => toQuickReply(row as unknown as QuickReplyRow))
  };
}

export async function createQuickReply(
  userId: string,
  input: QuickReplyInput
): Promise<QuickReplyContract> {
  const attachment = input.attachment
    ? await uploadAttachment(userId, input.attachment)
    : undefined;

  try {
    const row = await QuickReplyModel.create({
      userId,
      shortcut: input.shortcut.trim(),
      message: input.message.trim(),
      ...(attachment ? { attachment } : {})
    });
    return toQuickReply(row as unknown as QuickReplyRow);
  } catch (error) {
    if (attachment) await destroyWithoutBreakingPersistence(attachment);
    throw error;
  }
}

export async function updateQuickReply(
  userId: string,
  id: string,
  input: QuickReplyUpdateInput
): Promise<QuickReplyContract> {
  const exists = await QuickReplyModel.exists({ _id: id, userId });
  if (!exists) throw notFound();

  const attachment = input.attachment
    ? await uploadAttachment(userId, input.attachment)
    : undefined;
  const set: Record<string, unknown> = {};
  if (input.shortcut !== undefined) set.shortcut = input.shortcut.trim();
  if (input.message !== undefined) set.message = input.message.trim();
  if (attachment) set.attachment = attachment;

  try {
    const replaced = await QuickReplyModel.findOneAndUpdate(
      { _id: id, userId },
      { $set: set },
      { returnDocument: "before", runValidators: true }
    ).lean();
    if (!replaced) throw notFound();

    if (attachment && replaced.attachment) {
      await destroyWithoutBreakingPersistence(
        replaced.attachment as unknown as QuickReplyAttachmentContract
      );
    }

    // Dựng response từ đúng snapshot vừa bị thay thế và các giá trị đã ghi atomically.
    return toQuickReply({
      ...(replaced as unknown as QuickReplyRow),
      ...(input.shortcut === undefined ? {} : { shortcut: input.shortcut.trim() }),
      ...(input.message === undefined ? {} : { message: input.message.trim() }),
      ...(attachment ? { attachment } : {})
    });
  } catch (error) {
    if (attachment) await destroyWithoutBreakingPersistence(attachment);
    throw error;
  }
}

export async function deleteQuickReply(userId: string, id: string): Promise<void> {
  const row = await QuickReplyModel.findOneAndDelete({ _id: id, userId }).lean();
  if (!row) throw notFound();

  if (row.attachment) {
    await destroyWithoutBreakingPersistence(
      row.attachment as unknown as QuickReplyAttachmentContract
    );
  }
}
