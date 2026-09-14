import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const channelScopeSchema = new Schema(
  {
    mode: { type: String, enum: ["all", "channels"], default: "all", required: true },
    identifiers: { type: [String], default: [] }
  },
  { _id: false }
);

const automationTemplateSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assistantId: { type: Schema.Types.ObjectId, ref: "Assistant", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    keywords: { type: [String], required: true, validate: (value: string[]) => value.length > 0 },
    responseTemplate: { type: String, required: true, trim: true, maxlength: 2000 },
    allowAiRewrite: { type: Boolean, default: false },
    priority: { type: Number, default: 0, min: 0, max: 1000 },
    enabled: { type: Boolean, default: true },
    channelScope: { type: channelScopeSchema, default: () => ({}) }
  },
  { timestamps: true }
);

export type AutomationTemplate = InferSchemaType<typeof automationTemplateSchema>;
export const AutomationTemplateModel =
  mongoose.models.AutomationTemplate ?? model<AutomationTemplate>("AutomationTemplate", automationTemplateSchema);
