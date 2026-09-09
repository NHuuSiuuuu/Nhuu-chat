import type { RetrievedChunk } from "./vector.store.js";
export interface LlmProvider { answer(input: { question: string; context: RetrievedChunk[] }): Promise<string>; }
export class GroundedEchoProvider implements LlmProvider {
  async answer(input: { question: string; context: RetrievedChunk[] }) {
    return `Dựa trên thông tin: ${input.context.map((chunk) => chunk.content).join(" ")}`;
  }
}
