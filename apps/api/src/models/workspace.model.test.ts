import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { WorkspaceModel } from "./workspace.model.js";

describe("Workspace model", () => {
  it("requires an existing owner account and a name", async () => {
    const workspace = new WorkspaceModel();
    await expect(workspace.validate()).rejects.toMatchObject({
      errors: { ownerUserId: expect.anything(), name: expect.anything() }
    });
  });

  it("allows one personal Workspace per owner account", () => {
    expect(WorkspaceModel.schema.indexes()).toContainEqual([
      { ownerUserId: 1 }, expect.objectContaining({ unique: true })
    ]);
    expect(WorkspaceModel.schema.path("ownerUserId").options.ref).toBe("User");
    expect(WorkspaceModel.schema.path("ownerUserId").instance).toBe("ObjectId");
    expect(mongoose.Types.ObjectId.isValid(new mongoose.Types.ObjectId())).toBe(true);
  });
});
