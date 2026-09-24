import * as React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationContract } from "@nhuu-chat/contracts";
import { ConversationList } from "./ConversationList.js";

const conversation: ConversationContract = {
  id: "conversation-1", customerId: "customer-1", platform: "telegram", channelId: "channel-1", assignedAgentId: null,
  unreadCount: 2, status: "open", lastMessageAt: "2026-09-24T10:00:00.000Z", lastMessageSnippet: "Xin chào", customerName: "Minh"
};

function findButton(root: ReactTestInstance, label: string) {
  return root.find((node) => node.type === "button" && node.props["aria-label"] === label);
}

describe("ConversationList bulk actions", () => {
  beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterEach(() => vi.unstubAllGlobals());

  it("opens selection mode, selects a row and passes selected ids to the action", async () => {
    const onBulkAction = vi.fn().mockResolvedValue(undefined);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<ConversationList items={[conversation]} activeId={null} onSelect={vi.fn()} onBulkAction={onBulkAction} />); });
    await act(async () => { findButton(renderer.root, "Chọn nhiều hội thoại").props.onClick(); });
    const checkbox = renderer.root.find((node) => node.type === "input" && node.props["aria-label"] === "Chọn hội thoại Minh");
    await act(async () => { checkbox.props.onChange({ target: { checked: true } }); });
    await act(async () => { findButton(renderer.root, "Đánh dấu đã đọc").props.onClick(); });

    expect(onBulkAction).toHaveBeenCalledWith("read", ["conversation-1"]);
  });

  it("clears selection and exits when the close control is pressed", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<ConversationList items={[conversation]} activeId={null} onSelect={vi.fn()} onBulkAction={vi.fn()} />); });
    await act(async () => { findButton(renderer.root, "Chọn nhiều hội thoại").props.onClick(); });
    const checkbox = renderer.root.find((node) => node.type === "input" && node.props["aria-label"] === "Chọn hội thoại Minh");
    await act(async () => { checkbox.props.onChange({ target: { checked: true } }); });
    await act(async () => { findButton(renderer.root, "Thoát chế độ chọn").props.onClick(); });

    expect(() => findButton(renderer.root, "Đánh dấu đã đọc")).toThrow();
    expect(findButton(renderer.root, "Chọn nhiều hội thoại")).toBeTruthy();
  });
});
