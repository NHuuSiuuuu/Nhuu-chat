import { env, type AppEnv } from "@nhuu-chat/config";
import type { QuickReplyAttachmentContract } from "@nhuu-chat/contracts";
import { v2 as cloudinary } from "cloudinary";
import type { Writable } from "node:stream";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type MediaUploadResult = QuickReplyAttachmentContract;

type CloudinaryConfiguration = Pick<
  AppEnv,
  "CLOUDINARY_CLOUD_NAME" | "CLOUDINARY_API_KEY" | "CLOUDINARY_API_SECRET"
>;

type CloudinaryUploadOptions = {
  folder: string;
  resource_type: "image";
  filename_override: string;
  use_filename: boolean;
  unique_filename: boolean;
};

type CloudinaryUploadResponse = {
  secure_url: string;
  public_id: string;
  resource_type: "image" | "video" | "raw" | "auto";
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
};

export interface CloudinaryUploader {
  upload_stream(
    options: CloudinaryUploadOptions,
    callback: (error: unknown, result?: CloudinaryUploadResponse) => void
  ): Writable;
  destroy(publicId: string, options: { resource_type: "image" | "video" }): Promise<unknown>;
}

export type CloudinaryMediaServiceOptions = {
  uploader?: CloudinaryUploader;
  configuration?: CloudinaryConfiguration;
};

function isConfigured(configuration: CloudinaryConfiguration): boolean {
  return Boolean(
    configuration.CLOUDINARY_CLOUD_NAME
    && configuration.CLOUDINARY_API_KEY
    && configuration.CLOUDINARY_API_SECRET
  );
}

function toMediaUploadResult(response: CloudinaryUploadResponse, mimeType: string): MediaUploadResult {
  if (response.resource_type !== "image") {
    throw new Error("Cloudinary upload did not return an image");
  }

  return {
    secureUrl: response.secure_url,
    publicId: response.public_id,
    resourceType: response.resource_type,
    mimeType,
    bytes: response.bytes,
    ...(response.width === undefined ? {} : { width: response.width }),
    ...(response.height === undefined ? {} : { height: response.height }),
    ...(response.duration === undefined ? {} : { duration: response.duration })
  };
}

function createDefaultUploader(): CloudinaryUploader {
  return {
    upload_stream(options, callback) {
      return cloudinary.uploader.upload_stream(options, callback);
    },
    destroy(publicId, options) {
      return cloudinary.uploader.destroy(publicId, options);
    }
  };
}

export class CloudinaryMediaService {
  private readonly uploader: CloudinaryUploader;

  constructor(options: CloudinaryMediaServiceOptions = {}) {
    const configuration = options.configuration ?? env;

    if (!isConfigured(configuration)) {
      throw new Error("Cloudinary is not configured");
    }

    cloudinary.config({
      cloud_name: configuration.CLOUDINARY_CLOUD_NAME,
      api_key: configuration.CLOUDINARY_API_KEY,
      api_secret: configuration.CLOUDINARY_API_SECRET
    });
    this.uploader = options.uploader ?? createDefaultUploader();
  }

  // Tải ảnh hợp lệ lên thư mục riêng của người dùng và trả metadata dùng chung.
  async uploadImage(input: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    userId: string;
    folder: string;
  }): Promise<MediaUploadResult> {
    if (!input.mimeType.startsWith("image/")) {
      throw new Error("Unsupported image MIME type");
    }

    if (input.buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("Image exceeds 5 MiB limit");
    }

    return new Promise<MediaUploadResult>((resolve, reject) => {
      const stream = this.uploader.upload_stream({
        folder: `${input.folder}/${input.userId}`,
        resource_type: "image",
        filename_override: input.filename,
        use_filename: true,
        unique_filename: true
      }, (error, response) => {
        if (error) {
          reject(error);
          return;
        }

        if (!response) {
          reject(new Error("Cloudinary upload did not return metadata"));
          return;
        }

        try {
          resolve(toMediaUploadResult(response, input.mimeType));
        } catch (resultError) {
          reject(resultError);
        }
      });

      stream.once("error", reject);
      stream.end(input.buffer);
    });
  }

  async destroyMedia(publicId: string, resourceType: "image" | "video"): Promise<void> {
    await this.uploader.destroy(publicId, { resource_type: resourceType });
  }
}
