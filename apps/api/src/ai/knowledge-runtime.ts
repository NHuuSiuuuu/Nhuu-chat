import { DeterministicEmbeddingProvider } from "./embedding.provider.js";
import { InMemoryVectorStore } from "./vector.store.js";

export const knowledgeEmbedding = new DeterministicEmbeddingProvider();
export const knowledgeVectorStore = new InMemoryVectorStore();
