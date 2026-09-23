import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

export const workspaceRoles = ["owner", "admin", "staff"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

const workspaceMemberSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: workspaceRoles, required: true },
    allowedPages: { type: [String], default: [] }
  },
  { timestamps: true }
);

workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
workspaceMemberSchema.index(
  { workspaceId: 1 },
  { unique: true, partialFilterExpression: { role: "owner" } }
);

export type WorkspaceMember = InferSchemaType<typeof workspaceMemberSchema>;
export const WorkspaceMemberModel = mongoose.models.WorkspaceMember ?? model<WorkspaceMember>("WorkspaceMember", workspaceMemberSchema);
