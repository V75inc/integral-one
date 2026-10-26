import { ChevronDown, type LucideIcon } from "lucide-react";
import { Text } from "../../../ui";
import { IconWell, LINE_ICON_STROKE } from "../../../components/ui/IconWell";
import type { ReactNode } from "react";

/** One predictable disclosure row for each type of AI model. */
export function ModelCategory({
  id,
  title,
  description,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)]">
      <h3 aria-label={title}>
        <button
          type="button"
          aria-label={title}
          aria-describedby={`${id}-description`}
          id={`${id}-heading`}
          aria-expanded={open}
          aria-controls={`${id}-content`}
          onClick={onToggle}
          className="flex min-h-16 w-full items-center gap-3 p-4 text-left transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring-color)] sm:p-5"
        >
          <IconWell size="sm" aria-hidden>
            <Icon size={19} strokeWidth={LINE_ICON_STROKE} />
          </IconWell>
          <span className="min-w-0 flex-1 space-y-1">
            <Text as="span" weight="semibold" className="block">
              {title}
            </Text>
            <Text
              as="span"
              id={`${id}-description`}
              variant="body-sm"
              tone="muted"
              className="block"
            >
              {description}
            </Text>
          </span>
          <ChevronDown
            size={18}
            className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h3>
      <div
        id={`${id}-content`}
        role="region"
        aria-labelledby={`${id}-heading`}
        hidden={!open}
        className="border-t border-[var(--border-subtle)] p-4 sm:p-5"
      >
        {children}
      </div>
    </section>
  );
}
