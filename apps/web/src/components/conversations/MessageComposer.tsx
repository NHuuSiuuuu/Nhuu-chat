import * as React from "react";
import { useState } from "react";
export function MessageComposer({ onSend, disabled = false }: { onSend: (content: string) => Promise<void>; disabled?: boolean }) {
  const [content, setContent] = useState("");
  return <form onSubmit={async (event) => { event.preventDefault(); if (!content.trim()) return; await onSend(content); setContent(""); }}><input aria-label="Tin nhắn" value={content} onChange={(event) => setContent(event.target.value)} disabled={disabled} /><button type="submit" disabled={disabled}>Gửi</button></form>;
}
