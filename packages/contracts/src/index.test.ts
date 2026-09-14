import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  QuickReplyAttachmentContract,
  QuickReplyContract
} from "./index.js";

const attachment = {
  secureUrl: "https://res.cloudinary.com/example/image/upload/example.png",
  publicId: "nhuu-chat/quick-replies/user-id/file-id",
  resourceType: "image",
  mimeType: "image/png",
  bytes: 12_345,
  width: 800,
  height: 600
} satisfies QuickReplyAttachmentContract;

const quickReply = {
  id: "quick-reply-id",
  shortcut: "cskh",
  message: "Chăm sóc khách hàng 1",
  attachment
} satisfies QuickReplyContract;

describe("quick reply contracts", () => {
  it("supports the shared Cloudinary attachment metadata", () => {
    expect(quickReply.attachment).toMatchObject({
      secureUrl: attachment.secureUrl,
      publicId: attachment.publicId,
      resourceType: attachment.resourceType,
      mimeType: attachment.mimeType,
      bytes: attachment.bytes
    });
  });

  it("limits attachment resource types to supported media", () => {
    expectTypeOf<QuickReplyAttachmentContract["resourceType"]>().toEqualTypeOf<
      "image" | "video"
    >();
  });
});
