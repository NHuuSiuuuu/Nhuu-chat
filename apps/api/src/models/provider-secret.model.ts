import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const providerSecretSchema = new Schema(
  {
    provider: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    ciphertext: { type: String, required: true, select: false }
  },
  { timestamps: true }
);

providerSecretSchema.index({ provider: 1, name: 1 }, { unique: true });

export type ProviderSecret = InferSchemaType<typeof providerSecretSchema>;
export const ProviderSecretModel =
  mongoose.models.ProviderSecret ?? model<ProviderSecret>("ProviderSecret", providerSecretSchema);
