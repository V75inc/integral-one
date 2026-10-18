import { useMemo, useRef, useState } from "react";
import { ChevronRight, List } from "lucide-react";

import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { Input, Text } from "../../../ui";
import {
  mcpConnectorDetails,
  paramsFromInputSchema,
  type McpDiscoveredTool,
} from "./mcpConnectorDetails";
import type { ConnectorResponse } from "../../../api/connectors";

function toolCountLabel(count: number): string {
  return `${count} tool${count === 1 ? "" : "s"}`;
}

function ToolRow({ tool }: { tool: McpDiscoveredTool }) {
  const [open, setOpen] = useState(false);
  const params = paramsFromInputSchema(tool.inputSchema);
  const canExpand = Boolean(tool.description) || params.length > 0;

  return (
    <li className="border-b border-[var(--border-subtle)] last:border-b-0">
      <button
        type="button"
        className="flex w-full items-start gap-2 px-1 py-2.5 text-left rounded-[var(--radius-input)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
        onClick={() => canExpand && setOpen((prev) => !prev)}
        aria-expanded={canExpand ? open : undefined}
        disabled={!canExpand}
      >
        {canExpand ? (
          <Text
            as="span"
            tone="subtle"
            className={`mt-0.5 shrink-0 transition-transform duration-fast ${open ? "rotate-90" : ""}`}
          >
            <ChevronRight size={14} aria-hidden />
          </Text>
        ) : (
          <span className="mt-0.5 inline-block w-3.5 shrink-0" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <Text variant="mono" as="span" className="block truncate">
              {tool.name}
            </Text>
            {tool.write === true ? (
              <Text variant="meta" tone="warn" as="span" className="shrink-0">
                needs approval
              </Text>
            ) : null}
          </span>
          {!open && tool.description ? (
            <Text
              variant="meta"
              tone="subtle"
              as="span"
              className="mt-0.5 block line-clamp-2"
            >
              {tool.description}
            </Text>
          ) : null}
        </span>
      </button>
      {open && canExpand ? (
        <div className="pb-3 pl-6 pr-1">
          {tool.description ? (
            <Text variant="body-sm" as="p">
              {tool.description}
            </Text>
          ) : null}
          {params.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {params.map((param) => (
                <li key={param.name}>
                  <Text variant="mono" as="span">
                    {param.name}
                  </Text>
                  {param.required ? (
                    <Text
                      variant="meta"
                      tone="warn"
                      as="span"
                      className="ml-1.5"
                    >
                      required
                    </Text>
                  ) : null}
                  {param.type ? (
                    <Text
                      variant="meta"
                      tone="subtle"
                      as="span"
                      className="ml-1.5"
                    >
                      {param.type}
                    </Text>
                  ) : null}
                  {param.description ? (
                    <Text variant="meta" tone="muted" as="p" className="mt-0.5">
                      {param.description}
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function McpToolsInspector({
  connector,
  title,
  onClose,
  tools,
  metaLine,
  pending,
}: {
  connector: ConnectorResponse;
  title?: string;
  onClose: () => void;
  /** Override the auth_state-derived list (e.g. native rows via the API). */
  tools?: McpDiscoveredTool[] | null;
  /** Override the subtitle bits (transport/version/endpoint). */
  metaLine?: string;
  /** Show a loading state while tools are being fetched. */
  pending?: boolean;
}) {
  const details = mcpConnectorDetails(connector);
  const displayTitle = title || details.title;
  const listed = tools ?? details.tools;
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return listed;
    return listed.filter((tool) => {
      if (tool.name.toLowerCase().includes(q)) return true;
      return tool.description.toLowerCase().includes(q);
    });
  }, [listed, q]);
  const metaBits = [
    details.transportLabel,
    details.version ? `v${details.version}` : "",
    details.endpoint,
  ].filter(Boolean);

  return (
    <Modal
      open
      onClose={onClose}
      title={`${displayTitle} tools`}
      titleIcon={<List size={16} />}
      width="max-w-dialog-form"
      initialFocusRef={searchRef}
    >
      <Modal.Body noSpacing>
        <div className="flex flex-col gap-3 px-5 sm:px-6 pt-4 pb-2">
          <Text variant="body-sm" tone="subtle" as="p">
            {pending ? "Loading tools…" : toolCountLabel(listed.length)}
            {!pending &&
              (metaLine ??
                (metaBits.length ? ` · ${metaBits.join(" · ")}` : ""))}
          </Text>
          <Input
            ref={searchRef}
            size="sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools…"
            aria-label={`Search tools for ${displayTitle}`}
          />
          {q ? (
            <Text variant="meta" tone="subtle" as="p">
              {filtered.length} of {toolCountLabel(listed.length)}
            </Text>
          ) : null}
        </div>
        {pending ? (
          <div
            className="px-5 sm:px-6 py-8"
            role="status"
            aria-label="Loading tools"
          >
            <Text variant="body-sm" tone="muted" as="p">
              Loading tools…
            </Text>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 sm:px-6 py-8">
            <Text variant="body-sm" tone="muted" as="p">
              {listed.length === 0
                ? "No tools discovered on this connector."
                : `No tools match “${query.trim()}”.`}
            </Text>
          </div>
        ) : (
          <ul
            className="px-4 sm:px-5"
            aria-label={`Tools for ${displayTitle}`}
            data-testid="mcp-tools-inspector-list"
          >
            {filtered.map((tool) => (
              <ToolRow key={tool.name} tool={tool} />
            ))}
          </ul>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export { toolCountLabel };
