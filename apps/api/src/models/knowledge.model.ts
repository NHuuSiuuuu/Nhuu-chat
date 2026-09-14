import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const knowledgeDocumentSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    sourceType: { type: String, enum: ["text", "file", "url"], required: true },
    sourceUrl: { type: String, default: "" },
    content: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "processing", "ready", "failed"],
      default: "pending",
      index: true
    },
    error: { type: String, default: "" }
  },
  { timestamps: true }
);

const knowledgeChunkSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "KnowledgeDocument",
      required: true,
      index: true
    },
    content: { type: String, required: true },
    chunkIndex: { type: Number, required: true, min: 0 },
    embedding: { type: [Number], required: true },
    sourceMetadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

knowledgeChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });
knowledgeChunkSchema.index({ ownerId: 1, documentId: 1 });

export type KnowledgeDocument = InferSchemaType<typeof knowledgeDocumentSchema>;
export type KnowledgeChunk = InferSchemaType<typeof knowledgeChunkSchema>;

export const KnowledgeDocumentModel =
  mongoose.models.KnowledgeDocument ??
  model<KnowledgeDocument>("KnowledgeDocument", knowledgeDocumentSchema);
export const KnowledgeChunkModel =
  mongoose.models.KnowledgeChunk ?? model<KnowledgeChunk>("KnowledgeChunk", knowledgeChunkSchema);
