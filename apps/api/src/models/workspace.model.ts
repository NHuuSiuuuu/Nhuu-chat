import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const workspaceSchema = new Schema(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    name: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

export type Workspace = InferSchemaType<typeof workspaceSchema>;
export const WorkspaceModel = mongoose.models.Workspace ?? model<Workspace>("Workspace", workspaceSchema);
