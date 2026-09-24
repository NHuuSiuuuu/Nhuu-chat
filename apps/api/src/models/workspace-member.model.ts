import mongoose, { model, Schema, type InferSchemaType } from "mongoose";
import { workspaceChannelPlatforms } from "../auth/workspace-channel-access.js";

export const workspaceRoles = ["owner", "admin", "staff"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

const workspaceMemberSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: workspaceRoles, required: true },
    allowedPages: { type: [String], default: [] },
    allowedChannels: {
      type: [{ _id: false, platform: { type: String, enum: workspaceChannelPlatforms, required: true }, channelId: { type: String, required: true, trim: true } }],
      default: undefined
    },
    revokedChannels: {
      type: [{ _id: false, platform: { type: String, enum: workspaceChannelPlatforms, required: true }, channelId: { type: String, required: true, trim: true } }],
      default: []
    }
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
