import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationAvatar } from "./ConversationAvatar.js";

describe("ConversationAvatar", () => {
  it("passes the trimmed avatar URL from conversation data to the image source", () => {
    const html = renderToStaticMarkup(<ConversationAvatar name="Nguyễn Văn Hữu" avatarUrl="  https://cdn.example/avatar.png  " />);

    expect(html).toContain('src="https://cdn.example/avatar.png"');
    expect(html).toContain('alt="Avatar Nguyễn Văn Hữu"');
  });
});
