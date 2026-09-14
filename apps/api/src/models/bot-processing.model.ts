import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const botProcessingSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    customerMessageId: { type: Schema.Types.ObjectId, ref: "Message", required: true },
    externalMessageId: { type: String, trim: true },
    status: { type: String, enum: ["processing", "sent", "handed_off", "failed"], required: true },
    assistantId: { type: Schema.Types.ObjectId, ref: "Assistant", required: true },
    botMessageId: { type: Schema.Types.ObjectId, ref: "Message" },
    errorCode: { type: String, trim: true, maxlength: 100 }
  },
  { timestamps: true }
);

botProcessingSchema.index(
  { ownerId: 1, conversationId: 1, customerMessageId: 1 },
  { unique: true, partialFilterExpression: { customerMessageId: { $type: "objectId" } } }
);

export type BotProcessing = InferSchemaType<typeof botProcessingSchema>;
export const BotProcessingModel =
  mongoose.models.BotProcessing ?? model<BotProcessing>("BotProcessing", botProcessingSchema);
