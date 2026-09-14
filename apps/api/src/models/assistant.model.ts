import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const channelScopeSchema = new Schema(
  {
    mode: { type: String, enum: ["all", "channels"], default: "all", required: true },
    identifiers: { type: [String], default: [] }
  },
  { _id: false }
);

const assistantSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    instructions: { type: String, required: true, trim: true, maxlength: 4000 },
    modelTier: { type: String, enum: ["smart", "balanced", "economy"], default: "smart" },
    enabled: { type: Boolean, default: true },
    fallbackMessage: {
      type: String,
      trim: true,
      default: "Mình sẽ chuyển bạn đến nhân viên hỗ trợ nhé.",
      maxlength: 500
    },
    channelScope: { type: channelScopeSchema, default: () => ({}) },
    isDefault: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export type Assistant = InferSchemaType<typeof assistantSchema>;
export const AssistantModel =
  mongoose.models.Assistant ?? model<Assistant>("Assistant", assistantSchema);
