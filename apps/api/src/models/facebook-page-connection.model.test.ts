import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { FacebookPageConnectionModel } from "./facebook-page-connection.model.js";

describe("Facebook page connection model", () => {
  it("requires the user, page, and encrypted access token", async () => {
    const connection = new FacebookPageConnectionModel();

    await expect(connection.validate()).rejects.toMatchObject({
      errors: {
        userId: expect.anything(),
        pageId: expect.anything(),
        encryptedPageAccessToken: expect.anything()
      }
    });
  });

  it("hides the encrypted access token without limiting connections per user", () => {
    expect(FacebookPageConnectionModel.schema.path("encryptedPageAccessToken").options.select).toBe(false);

    const uniqueUserIndex = FacebookPageConnectionModel.schema.indexes().find(([fields, options]) =>
      fields.userId === 1 && options?.unique === true
    );

    expect(uniqueUserIndex).toBeUndefined();
    expect(FacebookPageConnectionModel.schema.indexes()).toContainEqual([
      { userId: 1 }, expect.not.objectContaining({ unique: true })
    ]);
  });

  it("declares a unique Page ID so concurrent owners cannot claim the same Page", () => {
    expect(FacebookPageConnectionModel.schema.indexes()).toContainEqual([
      { pageId: 1 },
      expect.objectContaining({ unique: true })
    ]);
  });

  it("uses the Facebook platform and connected status by default", () => {
    const connection = new FacebookPageConnectionModel({
      userId: new mongoose.Types.ObjectId(),
      pageId: "page-123",
      encryptedPageAccessToken: "ciphertext"
    });

    expect(connection.platform).toBe("facebook");
    expect(connection.status).toBe("connected");
  });

  it("stores an optional nullable avatar URL for existing and new connections", async () => {
    const connection = new FacebookPageConnectionModel({
      userId: new mongoose.Types.ObjectId(),
      pageId: "page-123",
      encryptedPageAccessToken: "ciphertext",
      avatarUrl: null
    });

    await expect(connection.validate()).resolves.toBeUndefined();
    expect(FacebookPageConnectionModel.schema.path("avatarUrl").options.default).toBeNull();
  });
});
