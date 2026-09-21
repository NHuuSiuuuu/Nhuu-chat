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

  it("hides the encrypted access token and limits each user to one connection", () => {
    expect(FacebookPageConnectionModel.schema.path("encryptedPageAccessToken").options.select).toBe(false);

    const uniqueUserIndex = FacebookPageConnectionModel.schema.indexes().find(([fields, options]) =>
      fields.userId === 1 && options?.unique === true
    );

    expect(uniqueUserIndex).toBeDefined();
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
});
