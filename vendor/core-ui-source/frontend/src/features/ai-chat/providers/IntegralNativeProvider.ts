import { createServerChatProvider } from "./ServerChatProvider";

/** Native Pydantic AI Harness routed through Integral's authenticated chat API. */
export const IntegralNativeProvider = createServerChatProvider({
  id: "integral_native",
  label: "Integral AI",
  capabilities: {
    reasoning: false,
    tools: true,
    attachments: true,
    vision: false,
    voice: false,
  },
});
