import { model, models, Schema, type InferSchemaType } from "mongoose";

export const roles = ["admin", "agent", "customer"] as const;
export type Role = (typeof roles)[number];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: roles, required: true },
    refreshTokenHash: { type: String, default: null, select: false }
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform: (_document, result) => {
    const safeResult = result as Record<string, unknown>;
    delete safeResult.passwordHash;
    delete safeResult.refreshTokenHash;
    return result;
  }
});

export type User = InferSchemaType<typeof userSchema>;

export const UserModel = models.User ?? model<User>("User", userSchema);
