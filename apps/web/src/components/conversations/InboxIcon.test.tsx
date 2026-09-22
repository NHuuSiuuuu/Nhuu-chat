import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InboxIcon } from "./InboxIcon.js";

describe("InboxIcon", () => {
  it("renders the bell used by general notification settings", () => {
    const html = renderToStaticMarkup(<InboxIcon name="bell" />);

    expect(html).toContain("M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9");
  });
});
