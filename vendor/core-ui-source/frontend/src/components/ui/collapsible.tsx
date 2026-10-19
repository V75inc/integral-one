"use client";

// Thin Radix Collapsible wrapper, ported from jvchat's
// `components/ui/collapsible.tsx`.
//
// jvchat imports the Collapsible primitive from the `radix-ui` umbrella package
// (`import { Collapsible as CollapsiblePrimitive } from "radix-ui"`). Integral
// does not depend on that umbrella, so this port imports the dedicated
// `@radix-ui/react-collapsible` package instead — same primitive, same API.
//   # deviation: integral lacks the `radix-ui` umbrella package; using the
//   dedicated @radix-ui/react-collapsible (installed for this port) — identical
//   primitive surface (Root / CollapsibleTrigger / CollapsibleContent).
//
// Refs are forwarded so the consuming Root components (ReasoningRoot,
// ToolGroupRoot, ToolFallbackRoot) can attach their `collapsibleRef` for
// assistant-ui's `useScrollLock` (anti-jump-on-collapse).
import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

const Collapsible = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Root>
>(({ ...props }, ref) => (
  <CollapsiblePrimitive.Root ref={ref} data-slot="collapsible" {...props} />
));
Collapsible.displayName = "Collapsible";

const CollapsibleTrigger = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.CollapsibleTrigger>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleTrigger>
>(({ ...props }, ref) => (
  <CollapsiblePrimitive.CollapsibleTrigger
    ref={ref}
    data-slot="collapsible-trigger"
    {...props}
  />
));
CollapsibleTrigger.displayName = "CollapsibleTrigger";

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.CollapsibleContent>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleContent>
>(({ ...props }, ref) => (
  <CollapsiblePrimitive.CollapsibleContent
    ref={ref}
    data-slot="collapsible-content"
    {...props}
  />
));
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
