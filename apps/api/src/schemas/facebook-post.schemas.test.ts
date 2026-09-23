import { describe, expect, it } from "vitest";

import { facebookPostCreateSchema, facebookPostListSchema } from "./facebook-post.schemas.js";

describe("Facebook post schemas", () => {
  it("accepts a pageId for Page-specific composition and filtering", () => {
    expect(facebookPostCreateSchema.parse({ message: "Hello", mode: "draft", pageId: "page-2" }))
      .toMatchObject({ pageId: "page-2" });
    expect(facebookPostListSchema.parse({ pageId: "page-2" })).toEqual({ pageId: "page-2" });
  });
});
