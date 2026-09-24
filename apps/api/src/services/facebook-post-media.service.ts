import type { FacebookPostMedia, QuickReplyAttachmentContract } from "@nhuu-chat/contracts";
import { CloudinaryMediaService } from "../media/cloudinary.service.js";

const FACEBOOK_POST_MEDIA_FOLDER = "nhuu-chat/facebook-posts";
const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ImageUploader = Pick<CloudinaryMediaService, "uploadImage" | "destroyMedia">;

export type FacebookPostMediaServiceDependencies = {
  mediaService?: ImageUploader;
  uploadImage?: ImageUploader["uploadImage"];
  destroyMedia?: ImageUploader["destroyMedia"];
};

function toFacebookPostMedia(result: QuickReplyAttachmentContract): FacebookPostMedia {
  if (result.resourceType !== "image") {
    throw new Error("Facebook post upload returned a non-image asset");
  }
  return {
    secureUrl: result.secureUrl,
    publicId: result.publicId,
    resourceType: "image",
    mimeType: result.mimeType,
    bytes: result.bytes,
    ...(result.width === undefined ? {} : { width: result.width }),
    ...(result.height === undefined ? {} : { height: result.height })
  };
}

export class FacebookPostMediaService {
  private readonly uploadImage: ImageUploader["uploadImage"];
  private readonly destroyMedia: ImageUploader["destroyMedia"];

  constructor(dependencies: FacebookPostMediaServiceDependencies = {}) {
    const mediaService = dependencies.mediaService ?? new CloudinaryMediaService();
    this.uploadImage = dependencies.uploadImage ?? mediaService.uploadImage.bind(mediaService);
    this.destroyMedia = dependencies.destroyMedia ?? mediaService.destroyMedia.bind(mediaService);
  }

  // Kiểm tra loại và kích thước trước khi chuyển buffer tới Cloudinary để giữ đúng giới hạn V1.
  async upload(userId: string, file: Express.Multer.File): Promise<FacebookPostMedia> {
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) throw new Error("Unsupported image MIME type");
    if (file.buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("Image exceeds 5 MiB limit");

    const result = await this.uploadImage({
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
      userId,
      folder: FACEBOOK_POST_MEDIA_FOLDER
    });
    return toFacebookPostMedia(result);
  }

  async destroy(media: FacebookPostMedia): Promise<void> {
    await this.destroyMedia(media.publicId, media.resourceType);
  }
}

export const facebookPostMediaService = new FacebookPostMediaService();
