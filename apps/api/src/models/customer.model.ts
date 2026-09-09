import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const platforms = ["facebook", "instagram", "zalo", "telegram", "telegram_personal"] as const;

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: "" },
    phoneNumber: { type: String, default: "" },
    email: { type: String, default: "" },
    platform: { type: String, enum: platforms, required: true },
    platformId: { type: String, required: true },
    tags: { type: [String], default: [] },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

customerSchema.index({ platform: 1, platformId: 1 }, { unique: true });

export type Customer = InferSchemaType<typeof customerSchema>;
export const CustomerModel = mongoose.models.Customer ?? model<Customer>("Customer", customerSchema);
