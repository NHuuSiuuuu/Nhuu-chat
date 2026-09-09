import type { ChatMessageContract, ConversationContract } from "@nhuu-chat/contracts";
import { MessageComposer } from "./MessageComposer.js";
export function ChatWindow({ conversation, messages, onSend }: { conversation: ConversationContract | null; messages: ChatMessageContract[]; onSend: (content: string) => Promise<void> }) {
  if (!conversation) return <section><p>Chọn một hội thoại.</p></section>;
  return <section aria-label="Cửa sổ chat"><h2>{conversation.channelId}</h2><div>{messages.map((message) => <p key={message.id}><strong>{message.senderType}:</strong> {message.content} <small>{message.deliveryStatus}</small></p>)}</div><MessageComposer onSend={onSend} /></section>;
}
