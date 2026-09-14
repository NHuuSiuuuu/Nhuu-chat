import { beforeEach, describe, expect, it, vi } from "vitest";

const media = vi.hoisted(() => ({
  uploadImage: vi.fn(),
  destroyMedia: vi.fn()
}));
const model = vi.hoisted(() => ({
  find: vi.fn(),
  exists: vi.fn(),
  create: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOneAndDelete: vi.fn()
}));

vi.mock("../media/cloudinary.service.js", () => ({
  CloudinaryMediaService: class {
    uploadImage = media.uploadImage;
    destroyMedia = media.destroyMedia;
  }
}));
vi.mock("../models/quick-reply.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../models/quick-reply.model.js")>();
  return {
    QuickReplyModel: {
      ...model,
      schema: actual.QuickReplyModel.schema
    }
  };
});

import { QuickReplyModel } from "../models/quick-reply.model.js";
import {
  createQuickReply,
  deleteQuickReply,
  listQuickReplies,
  updateQuickReply,
  type UploadedFile
} from "./quick-reply.service.js";

const userId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439012";
const image: UploadedFile = {
  buffer: Buffer.from("image"),
  originalname: "welcome.png",
  mimetype: "image/png",
  size: 5
};
const uploadedAttachment = {
  secureUrl: "https://res.cloudinary.com/example/welcome.png",
  publicId: "nhuu-chat/quick-replies/user/welcome",
  resourceType: "image" as const,
  mimeType: "image/png",
  bytes: 5,
  width: 320,
  height: 200
};

function leanResult<T>(value: T) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

describe("quick reply service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    media.uploadImage.mockResolvedValue(uploadedAttachment);
    media.destroyMedia.mockResolvedValue(undefined);
    model.exists.mockResolvedValue({ _id: "reply-1" });
  });

  it("creates and lists only the authenticated user's quick replies", async () => {
    model.create.mockResolvedValue({
      _id: "reply-1",
      shortcut: "welcome",
      message: "Welcome to Nhuu"
    });
    const listQuery = leanResult([{
      _id: "reply-1",
      shortcut: "welcome",
      message: "Welcome to Nhuu"
    }]);
    const sort = vi.fn().mockReturnValue(listQuery);
    model.find.mockReturnValue({ sort });

    await expect(createQuickReply(userId, {
      shortcut: " welcome ",
      message: " Welcome to Nhuu "
    })).resolves.toEqual({
      id: "reply-1",
      shortcut: "welcome",
      message: "Welcome to Nhuu"
    });
    await expect(listQuickReplies(userId)).resolves.toEqual({
      quickReplies: [{
        id: "reply-1",
        shortcut: "welcome",
        message: "Welcome to Nhuu"
      }]
    });

    expect(model.create).toHaveBeenCalledWith({
      userId,
      shortcut: "welcome",
      message: "Welcome to Nhuu"
    });
    expect(model.find).toHaveBeenCalledWith({ userId });
    expect(sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
  });

  it("defines shortcut uniqueness within each user rather than globally", () => {
    const compoundIndex = QuickReplyModel.schema.indexes().find(([keys]) => (
      keys.userId === 1 && keys.shortcut === 1
    ));

    expect(compoundIndex).toEqual([
      { userId: 1, shortcut: 1 },
      expect.objectContaining({ unique: true })
    ]);
  });

  it.each([
    ["non-image", new Error("Unsupported image MIME type")],
    ["oversized", new Error("Image exceeds 5 MiB limit")]
  ])("does not persist an attachment when Cloudinary rejects a %s file", async (_case, error) => {
    media.uploadImage.mockRejectedValue(error);

    await expect(createQuickReply(userId, {
      shortcut: "image",
      message: "Image reply",
      attachment: image
    })).rejects.toThrow(error.message);

    expect(model.create).not.toHaveBeenCalled();
  });

  it("removes a newly uploaded orphan when Mongo rejects the create", async () => {
    const duplicateError = Object.assign(new Error("duplicate shortcut"), { code: 11000 });
    model.create.mockRejectedValue(duplicateError);

    await expect(createQuickReply(userId, {
      shortcut: "duplicate",
      message: "Replacement",
      attachment: image
    })).rejects.toBe(duplicateError);

    expect(media.destroyMedia).toHaveBeenCalledWith(
      uploadedAttachment.publicId,
      uploadedAttachment.resourceType
    );
  });

  it("returns 404 without uploading when an update targets another user's reply", async () => {
    model.exists.mockResolvedValue(null);

    await expect(updateQuickReply(userId, "foreign-reply", {
      message: "Stolen",
      attachment: image
    })).rejects.toEqual(expect.objectContaining({
      statusCode: 404,
      code: "QUICK_REPLY_NOT_FOUND"
    }));
    expect(model.exists).toHaveBeenCalledWith({ _id: "foreign-reply", userId });
    expect(media.uploadImage).not.toHaveBeenCalled();
  });

  it("replaces an attachment and cleans up the previous Cloudinary asset", async () => {
    const oldAttachment = {
      ...uploadedAttachment,
      secureUrl: "https://res.cloudinary.com/example/old.png",
      publicId: "nhuu-chat/quick-replies/user/old"
    };
    model.findOneAndUpdate.mockReturnValue(leanResult({
      _id: "reply-1",
      shortcut: "photo",
      message: "Old photo",
      attachment: oldAttachment
    }));

    await expect(updateQuickReply(userId, "reply-1", {
      message: "New photo",
      attachment: image
    })).resolves.toEqual({
      id: "reply-1",
      shortcut: "photo",
      message: "New photo",
      attachment: uploadedAttachment
    });
    expect(media.uploadImage).toHaveBeenCalledWith({
      buffer: image.buffer,
      filename: image.originalname,
      mimeType: image.mimetype,
      userId,
      folder: "nhuu-chat/quick-replies"
    });
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "reply-1", userId },
      { $set: { message: "New photo", attachment: uploadedAttachment } },
      { returnDocument: "before", runValidators: true }
    );
    expect(media.destroyMedia).toHaveBeenCalledWith(oldAttachment.publicId, "image");
  });

  it("cleans the exact attachments atomically replaced by overlapping updates", async () => {
    const oldAttachment = {
      ...uploadedAttachment,
      secureUrl: "https://res.cloudinary.com/example/old.png",
      publicId: "nhuu-chat/quick-replies/user/old"
    };
    const firstReplacement = {
      ...uploadedAttachment,
      secureUrl: "https://res.cloudinary.com/example/first.png",
      publicId: "nhuu-chat/quick-replies/user/first"
    };
    const secondReplacement = {
      ...uploadedAttachment,
      secureUrl: "https://res.cloudinary.com/example/second.png",
      publicId: "nhuu-chat/quick-replies/user/second"
    };
    const oldRow = {
      _id: "reply-1",
      shortcut: "photo",
      message: "Old photo",
      attachment: oldAttachment
    };
    media.uploadImage
      .mockResolvedValueOnce(firstReplacement)
      .mockResolvedValueOnce(secondReplacement);
    model.findOneAndUpdate
      .mockReturnValueOnce(leanResult(oldRow))
      .mockReturnValueOnce(leanResult({
        ...oldRow,
        message: "First replacement",
        attachment: firstReplacement
      }));

    const [first, second] = await Promise.all([
      updateQuickReply(userId, "reply-1", {
        message: "First replacement",
        attachment: image
      }),
      updateQuickReply(userId, "reply-1", {
        message: "Second replacement",
        attachment: image
      })
    ]);

    expect(first).toMatchObject({
      message: "First replacement",
      attachment: firstReplacement
    });
    expect(second).toMatchObject({
      message: "Second replacement",
      attachment: secondReplacement
    });
    expect(media.destroyMedia.mock.calls.map(([publicId]) => publicId)).toEqual([
      oldAttachment.publicId,
      firstReplacement.publicId
    ]);
  });

  it("removes the replacement upload if Mongo rejects an update", async () => {
    const duplicateError = Object.assign(new Error("duplicate shortcut"), { code: 11000 });
    model.findOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockRejectedValue(duplicateError)
    });

    await expect(updateQuickReply(userId, "reply-1", {
      shortcut: "duplicate",
      attachment: image
    })).rejects.toBe(duplicateError);
    expect(media.destroyMedia).toHaveBeenCalledWith(
      uploadedAttachment.publicId,
      uploadedAttachment.resourceType
    );
  });

  it("deletes only an owned reply and cleans up its attachment", async () => {
    model.findOneAndDelete.mockReturnValue(leanResult({
      _id: "reply-1",
      shortcut: "remove",
      message: "Remove me",
      attachment: uploadedAttachment
    }));

    await expect(deleteQuickReply(userId, "reply-1")).resolves.toBeUndefined();

    expect(model.findOneAndDelete).toHaveBeenCalledWith({ _id: "reply-1", userId });
    expect(media.destroyMedia).toHaveBeenCalledWith(
      uploadedAttachment.publicId,
      uploadedAttachment.resourceType
    );
  });

  it("returns 404 when deleting a reply outside the user's scope", async () => {
    model.findOneAndDelete.mockReturnValue(leanResult(null));

    await expect(deleteQuickReply(otherUserId, "reply-1")).rejects.toMatchObject({
      statusCode: 404,
      code: "QUICK_REPLY_NOT_FOUND"
    });
    expect(media.destroyMedia).not.toHaveBeenCalled();
  });
});
