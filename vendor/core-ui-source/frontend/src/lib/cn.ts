// Tailwind-aware className combiner, ported verbatim from jvchat's
// `lib/utils.ts`.
//
// Used by the jvchat-faithful assistant-ui scaffold (collapsible, Reasoning,
// ToolGroup, ToolFallback). `clsx` + `tailwind-merge` resolve in integral's
// node_modules (tailwind-merge is a direct dep of class-variance-authority,
// clsx is present transitively).
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
