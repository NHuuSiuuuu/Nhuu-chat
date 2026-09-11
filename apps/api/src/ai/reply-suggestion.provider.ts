import { GoogleGenAI, Type } from "@google/genai";
import { env } from "@nhuu-chat/config";

const MAX_SUGGESTIONS = 3;
const MAX_SUGGESTION_LENGTH = 240;
const REQUEST_TIMEOUT_MS = 10_000;

type SuggestionsPayload = {
  suggestions: unknown;
};

function isSuggestionsPayload(payload: unknown): payload is SuggestionsPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "suggestions" in payload
  );
}

function normalizeSuggestions(payload: unknown): string[] {
  if (!isSuggestionsPayload(payload)) {
    throw new Error("Gemini response did not contain suggestions");
  }

  if (!Array.isArray(payload.suggestions)) {
    throw new Error("Gemini response did not contain suggestions");
  }

  const suggestions = payload.suggestions
    .filter((suggestion): suggestion is string => typeof suggestion === "string")
    .map((suggestion) => suggestion.trim().slice(0, MAX_SUGGESTION_LENGTH))
    .filter((suggestion) => suggestion.length > 0)
    .slice(0, MAX_SUGGESTIONS);

  if (suggestions.length === 0) {
    throw new Error("Gemini response contained no usable suggestions");
  }

  return suggestions;
}

export class GeminiReplySuggestionProvider {
  private readonly client: GoogleGenAI;

  constructor() {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  // Generates short customer-service replies and bounds the external provider call.
  async suggest(input: { conversationContext: string }): Promise<string[]> {
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          abortController.abort();
          reject(new Error("Gemini request timed out"));
        }, REQUEST_TIMEOUT_MS);
      });
      const request = this.client.models.generateContent({
        model: env.GEMINI_CHAT_MODEL,
        contents: `Generate short, polite Vietnamese customer-service replies based on the conversation context. Do not invent prices, policies, order status, or claim unsupported actions.\n\nConversation context (oldest to newest):\n${input.conversationContext}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["suggestions"]
          },
          abortSignal: abortController.signal,
          httpOptions: { timeout: REQUEST_TIMEOUT_MS }
        }
      });
      const response = await Promise.race([request, timeout]);

      let payload: unknown;
      if (typeof response.text !== "string") {
        throw new Error("Gemini response did not contain text");
      }
      payload = JSON.parse(response.text);

      if (typeof payload !== "object" || payload === null) {
        throw new Error("Gemini response was not a JSON object");
      }

      return normalizeSuggestions(payload);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("Gemini response was not valid JSON");
      }
      throw error;
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }
}
