import { env, type AppEnv } from "@nhuu-chat/config";
import type { QuickReplyAttachmentContract } from "@nhuu-chat/contracts";
import { v2 as cloudinary } from "cloudinary";
import type { Writable } from "node:stream";
import { AppError } from "../common/errors.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type MediaUploadResult = QuickReplyAttachmentContract;

type CloudinaryConfiguration = Pick<
  AppEnv,
  "CLOUDINARY_CLOUD_NAME" | "CLOUDINARY_API_KEY" | "CLOUDINARY_API_SECRET"
>;

type CloudinaryUploadOptions = {
  folder: string;
  resource_type: "image" | "raw";
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
  destroy(publicId: string, options: { resource_type: "image" | "video" | "raw" }): Promise<unknown>;
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
  if (response.resource_type !== "image" && response.resource_type !== "raw") {
    throw new Error("Cloudinary upload did not return supported media");
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
      return cloudinary.uploader.destroy(publicId, options as { resource_type: "image" | "video" });
    }
  };
}

export class CloudinaryMediaService {
  private readonly configuration: CloudinaryConfiguration;
  private readonly uploader: CloudinaryUploader;

  constructor(options: CloudinaryMediaServiceOptions = {}) {
    this.configuration = options.configuration ?? env;
    this.uploader = options.uploader ?? createDefaultUploader();
  }

  // Chỉ xác thực cấu hình khi một thao tác thực sự cần gọi Cloudinary.
  private configureCloudinary(): void {
    if (!isConfigured(this.configuration)) {
      throw new AppError(503, "CLOUDINARY_NOT_CONFIGURED", "Cloudinary is not configured");
    }

    cloudinary.config({
      cloud_name: this.configuration.CLOUDINARY_CLOUD_NAME,
      api_key: this.configuration.CLOUDINARY_API_KEY,
      api_secret: this.configuration.CLOUDINARY_API_SECRET
    });
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

    this.configureCloudinary();

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

  // Lưu media outbound để message còn tải được sau khi reload, trong khi connector nhận buffer trực tiếp.
  async uploadFile(input: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    userId: string;
    folder: string;
  }): Promise<MediaUploadResult> {
    if (input.buffer.byteLength > MAX_FILE_BYTES) {
      throw new Error("File exceeds 20 MiB limit");
    }

    this.configureCloudinary();

    return new Promise<MediaUploadResult>((resolve, reject) => {
      const stream = this.uploader.upload_stream({
        folder: `${input.folder}/${input.userId}`,
        resource_type: input.mimeType.startsWith("image/") ? "image" : "raw",
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

  async destroyMedia(publicId: string, resourceType: "image" | "video" | "raw"): Promise<void> {
    this.configureCloudinary();
    await this.uploader.destroy(publicId, { resource_type: resourceType });
  }
}
