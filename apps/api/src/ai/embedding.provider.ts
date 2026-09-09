export interface EmbeddingProvider { embed(text: string): Promise<number[]>; }

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const vector = [0, 0, 0, 0];
    for (let i = 0; i < text.length; i++) vector[i % vector.length] += text.charCodeAt(i) / 1000;
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => value / magnitude);
  }
}
