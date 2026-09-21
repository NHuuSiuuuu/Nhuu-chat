import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

import type { FacebookPostMedia } from "@nhuu-chat/contracts";
import { FacebookPostMediaService } from "./facebook-post-media.service.js";
import { FacebookPublisher } from "./facebook-publisher.service.js";

const metadata: FacebookPostMedia = {
  secureUrl: "https://res.cloudinary.com/example/image/upload/post.jpg",
  publicId: "nhuu-chat/facebook-posts/user-1/post",
  resourceType: "image",
  mimeType: "image/jpeg",
  bytes: 100,
  width: 800,
  height: 600
};

function file(mimetype: string, size = 100): Express.Multer.File {
  return {
    fieldname: "image",
    originalname: "post.jpg",
    encoding: "7bit",
    mimetype,
    size,
    destination: "",
    filename: "post.jpg",
    path: "",
    stream: Readable.from([]),
    buffer: Buffer.alloc(size)
  };
}

describe("FacebookPostMediaService", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", async (mimetype) => {
    const uploadImage = vi.fn().mockResolvedValue({ ...metadata, mimeType: mimetype });
    const service = new FacebookPostMediaService({ uploadImage });

    await expect(service.upload("user-1", file(mimetype))).resolves.toMatchObject({ mimeType: mimetype });
    expect(uploadImage).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      folder: "nhuu-chat/facebook-posts",
      mimeType: mimetype
    }));
  });

  it("accepts an image exactly at the 5 MiB boundary", async () => {
    const uploadImage = vi.fn().mockResolvedValue({ ...metadata, bytes: 5 * 1024 * 1024 });
    const service = new FacebookPostMediaService({ uploadImage });

    await expect(service.upload("user-1", file("image/png", 5 * 1024 * 1024))).resolves.toMatchObject({ bytes: 5 * 1024 * 1024 });
  });

  it.each([
    ["image/gif", 100, "Unsupported image MIME type"],
    ["image/jpeg", 5 * 1024 * 1024 + 1, "Image exceeds 5 MiB limit"]
  ])("rejects invalid upload %s", async (mimetype, size, message) => {
    const uploadImage = vi.fn();
    const service = new FacebookPostMediaService({ uploadImage });

    await expect(service.upload("user-1", file(mimetype, size))).rejects.toThrow(message);
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("maps Cloudinary metadata and destroys an orphan after persistence fails", async () => {
    const uploadImage = vi.fn().mockResolvedValue(metadata);
    const destroyMedia = vi.fn().mockResolvedValue(undefined);
    const persistMedia = vi.fn().mockRejectedValue(new Error("persistence failed"));
    const service = new FacebookPostMediaService({ uploadImage, destroyMedia });

    const uploaded = await service.upload("user-1", file("image/jpeg"));
    try {
      await persistMedia(uploaded);
    } catch {
      await service.destroy(uploaded);
    }

    expect(uploaded).toEqual(metadata);
    expect(persistMedia).toHaveBeenCalledWith(metadata);
    expect(destroyMedia).toHaveBeenCalledWith(metadata.publicId, "image");
  });

  it("retains uploaded media when a later publish operation fails", async () => {
    const uploadImage = vi.fn().mockResolvedValue(metadata);
    const destroyMedia = vi.fn();
    const fetchGraph = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 200, message: "Permission denied" }
    }), { status: 403, headers: { "content-type": "application/json" } }));
    const service = new FacebookPostMediaService({ uploadImage, destroyMedia });
    const publisher = new FacebookPublisher({ fetchGraph, graphApiVersion: "v26.0" });

    const uploaded = await service.upload("user-1", file("image/jpeg"));
    await expect(publisher.publish({
      pageId: "page-1",
      pageAccessToken: "page-secret",
      message: "Caption",
      mediaUrl: uploaded.secureUrl
    })).rejects.toMatchObject({ code: "FACEBOOK_PERMISSION_DENIED" });

    expect(uploaded.secureUrl).toBe(metadata.secureUrl);
    expect(fetchGraph).toHaveBeenCalledWith(
      "https://graph.facebook.com/v26.0/page-1/photos",
      expect.objectContaining({ method: "POST" })
    );
    expect(destroyMedia).not.toHaveBeenCalled();
  });
});
