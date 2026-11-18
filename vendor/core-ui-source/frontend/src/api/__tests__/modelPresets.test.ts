import { describe, expect, it } from "vitest";
import { defaultModel, RECOMMENDED_MODELS } from "../modelPresets";

describe("guided harness defaults", () => {
  it("does not recommend a light model for a single-model configuration", () => {
    expect(defaultModel("openai")).toBe("gpt-6.1-sol");
    expect(defaultModel("openrouter")).toBe("openai/gpt-6.1-sol");
    expect(defaultModel("ollama")).toBe("deepseek-v4.1-flash");
    expect(defaultModel("anthropic")).toBe("claude-opus-5-5");
    expect(defaultModel("ollama_local")).toBe("");
    expect(defaultModel("custom_openai")).toBe("");
    expect(RECOMMENDED_MODELS.openai.find(m => m.id === "gpt-5.4-mini")?.recommended).not.toBe(true);
  });
});
