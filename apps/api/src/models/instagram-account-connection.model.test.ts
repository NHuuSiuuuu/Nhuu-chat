import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startTestDatabase, stopTestDatabase } from "../test/mongo-repl-set.js";
import { InstagramAccountConnectionModel } from "./instagram-account-connection.model.js";

describe("Instagram account connection model", () => {
  beforeAll(async () => {
    await startTestDatabase();
    await InstagramAccountConnectionModel.syncIndexes();
  }, 120_000);
  afterAll(async () => { await stopTestDatabase(); }, 30_000);

  it("requires the owner, Instagram ID and encrypted credential", async () => {
    await expect(new InstagramAccountConnectionModel().validate()).rejects.toMatchObject({
      errors: { ownerUserId: expect.anything(), instagramUserId: expect.anything(), encryptedAccessToken: expect.anything() }
    });
  });

  it("excludes the encrypted credential from ordinary queries", async () => {
    const record = await InstagramAccountConnectionModel.create({
      ownerUserId: new mongoose.Types.ObjectId(), instagramUserId: "ig-secret-test", encryptedAccessToken: "ciphertext"
    });
    const loaded = await InstagramAccountConnectionModel.findById(record.id).lean();
    expect(loaded?.encryptedAccessToken).toBeUndefined();
    expect((await InstagramAccountConnectionModel.findById(record.id).select("+encryptedAccessToken").lean())?.encryptedAccessToken).toBe("ciphertext");
  });

  it("reserves an Instagram account globally while allowing different accounts for one owner", async () => {
    const ownerUserId = new mongoose.Types.ObjectId();
    await InstagramAccountConnectionModel.create({ ownerUserId, instagramUserId: "ig-global-1", encryptedAccessToken: "ciphertext" });
    await InstagramAccountConnectionModel.create({ ownerUserId, instagramUserId: "ig-global-2", encryptedAccessToken: "ciphertext" });
    await expect(InstagramAccountConnectionModel.create({
      ownerUserId: new mongoose.Types.ObjectId(), instagramUserId: "ig-global-1", encryptedAccessToken: "ciphertext"
    })).rejects.toMatchObject({ code: 11000 });
  });
});
