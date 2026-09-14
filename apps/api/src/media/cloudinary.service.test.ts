import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

type UploadResult = {
  secure_url: string;
  public_id: string;
  resource_type: "image";
  bytes: number;
  width: number;
  height: number;
};

type MockUploader = {
  upload_stream: (options: unknown, callback: (error: unknown, result?: UploadResult) => void) => Writable;
  destroy: (publicId: string, options: { resource_type: "image" | "video" }) => Promise<unknown>;
};

const validEnvironment = {
  NODE_ENV: "test",
  PORT: "3000",
  MONGODB_URI: "mongodb://localhost:27017/nhuu-chat?replicaSet=rs0",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "a-jwt-secret-that-is-at-least-32-characters",
  ENCRYPTION_KEY: "an-encryption-key-that-is-32-characters",
  TELEGRAM_BOT_TOKEN: "123456789:test-token",
  TELEGRAM_WEBHOOK_SECRET: "a-telegram-webhook-secret",
  CLOUDINARY_CLOUD_NAME: "cloudinary-cloud",
  CLOUDINARY_API_KEY: "cloudinary-api-key",
  CLOUDINARY_API_SECRET: "cloudinary-api-secret"
};

function stubEnvironment(overrides: Partial<typeof validEnvironment> = {}) {
  for (const [name, value] of Object.entries({ ...validEnvironment, ...overrides })) {
    vi.stubEnv(name, value);
  }
}

async function importService() {
  vi.resetModules();
  return import("./cloudinary.service.js");
}

function createUploader(): MockUploader & {
  upload_stream: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  return {
    upload_stream: vi.fn((_options, callback) => new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
      final(done) {
        callback(null, {
          secure_url: "https://res.cloudinary.com/example/image/upload/sample.png",
          public_id: "nhuu-chat/quick-replies/user-1/sample",
          resource_type: "image",
          bytes: 12_345,
          width: 800,
          height: 600
        });
        done();
      }
    })),
    destroy: vi.fn().mockResolvedValue({ result: "ok" })
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CloudinaryMediaService", () => {
  it("uploads an image and returns shared attachment metadata", async () => {
    stubEnvironment();
    const { CloudinaryMediaService } = await importService();
    const uploader = createUploader();
    const service = new CloudinaryMediaService({ uploader });

    await expect(service.uploadImage({
      buffer: Buffer.from("image"),
      filename: "sample.png",
      mimeType: "image/png",
      userId: "user-1",
      folder: "nhuu-chat/quick-replies"
    })).resolves.toEqual({
      secureUrl: "https://res.cloudinary.com/example/image/upload/sample.png",
      publicId: "nhuu-chat/quick-replies/user-1/sample",
      resourceType: "image",
      mimeType: "image/png",
      bytes: 12_345,
      width: 800,
      height: 600
    });

    expect(uploader.upload_stream).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: "nhuu-chat/quick-replies/user-1",
        resource_type: "image",
        use_filename: true,
        unique_filename: true
      }),
      expect.any(Function)
    );
  });

  it("defers missing Cloudinary configuration until an image upload", async () => {
    stubEnvironment({ CLOUDINARY_API_SECRET: "" });
    const { CloudinaryMediaService } = await importService();
    const uploader = createUploader();
    const service = new CloudinaryMediaService({ uploader });

    await expect(service.uploadImage({
      buffer: Buffer.from("image"),
      filename: "sample.png",
      mimeType: "image/png",
      userId: "user-1",
      folder: "nhuu-chat/quick-replies"
    })).rejects.toThrow("Cloudinary is not configured");

    expect(uploader.upload_stream).not.toHaveBeenCalled();
  });

  it("rejects a non-image MIME type before uploading", async () => {
    stubEnvironment();
    const { CloudinaryMediaService } = await importService();
    const uploader = createUploader();
    const service = new CloudinaryMediaService({ uploader });

    await expect(service.uploadImage({
      buffer: Buffer.from("text"),
      filename: "notes.txt",
      mimeType: "text/plain",
      userId: "user-1",
      folder: "nhuu-chat/quick-replies"
    })).rejects.toThrow("Unsupported image MIME type");

    expect(uploader.upload_stream).not.toHaveBeenCalled();
  });

  it("rejects an image larger than 5 MiB before uploading", async () => {
    stubEnvironment();
    const { CloudinaryMediaService } = await importService();
    const uploader = createUploader();
    const service = new CloudinaryMediaService({ uploader });

    await expect(service.uploadImage({
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
      filename: "large.png",
      mimeType: "image/png",
      userId: "user-1",
      folder: "nhuu-chat/quick-replies"
    })).rejects.toThrow("Image exceeds 5 MiB limit");

    expect(uploader.upload_stream).not.toHaveBeenCalled();
  });

  it("destroys media with its resource type", async () => {
    stubEnvironment();
    const { CloudinaryMediaService } = await importService();
    const uploader = createUploader();
    const service = new CloudinaryMediaService({ uploader });

    await expect(
      service.destroyMedia("nhuu-chat/quick-replies/user-1/sample", "image")
    ).resolves.toBeUndefined();

    expect(uploader.destroy).toHaveBeenCalledWith(
      "nhuu-chat/quick-replies/user-1/sample",
      { resource_type: "image" }
    );
  });
});
