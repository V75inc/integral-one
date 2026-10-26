import { useCallback, useEffect, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronRight,
  Lock,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import {
  skillsApi,
  type SkillBrowseQuery,
  type SkillSummary,
} from "../../../api/skills";
import { useScope } from "../../../context/ScopeContext";
import { useToast } from "../../../context/ToastContext";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Skeleton } from "../../../components/ui/Skeleton";
import { SkillEditorModal } from "../../../components/skills/SkillEditorModal";
import { Modal } from "../../../components/ui/Modal";
import { Section } from "../../../patterns";
import { Input, Select, Stack, Surface, Text } from "../../../ui";
import {
  SkillPagination,
  SkillContextInspector,
} from "./SkillContextInspector";

const PAGE_SIZE = 10;
const INITIAL_FILTERS: SkillBrowseQuery = {
  page: 1,
  page_size: PAGE_SIZE,
  search: "",
  source: "all",
  app_id: "",
};

export function SkillsSection() {
  const { scope, activeWorkspace, isPersonal } = useScope();
  const workspaceId = scope?.workspaceId;
  const canManage =
    isPersonal ||
    activeWorkspace?.your_role === "admin" ||
    activeWorkspace?.your_role === "owner";
  // Reset all browse/editor state on a workspace change. Never retain another
  // workspace's rows while the next page is loading.
  return (
    <SkillsBrowser
      key={workspaceId ?? "none"}
      workspaceId={workspaceId}
      canManage={canManage}
    />
  );
}

function SkillsBrowser({
  workspaceId,
  canManage,
}: {
  workspaceId?: string;
  canManage: boolean;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [search, setSearch] = useState("");
  const [editorId, setEditorId] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const closeEditor = useCallback(() => setEditorId(null), []);

  useEffect(() => {
    const timer = setTimeout(
      () =>
        setFilters((current) =>
          current.search === search.trim()
            ? current
            : { ...current, search: search.trim(), page: 1 },
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [search]);

  const pageQuery = useQuery({
    queryKey: ["skills", workspaceId, "browse", filters],
    queryFn: () => skillsApi.browse(filters),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const data = pageQuery.data;
  useEffect(() => {
    if (data && !pageQuery.isPlaceholderData && data.page !== filters.page)
      setFilters((current) => ({ ...current, page: data.page }));
  }, [data, filters.page, pageQuery.isPlaceholderData]);

  const invalidateSkills = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["skills", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["effective-skills", workspaceId] }),
    ]);
  }, [qc, workspaceId]);
  const savedSkill = useCallback(async () => {
    if (editorId === "__new__") {
      setSearch("");
      setFilters({ ...INITIAL_FILTERS, source: "workspace" });
    }
    await invalidateSkills();
  }, [editorId, invalidateSkills]);
  const toggle = useMutation({
    mutationFn: (skill: SkillSummary) =>
      skillsApi.update(skill.id, { enabled: !skill.enabled }),
    onSuccess: async (_, skill) => {
      toast.showToast(
        `Skill ${skill.enabled ? "disabled" : "enabled"}`,
        "success",
      );
      await invalidateSkills();
    },
    onError: () => toast.showToast("Could not update this skill", "error"),
  });
  const changeSource = (source: SkillBrowseQuery["source"]) =>
    setFilters((current) => ({ ...current, source, app_id: "", page: 1 }));
  const filtered = Boolean(
    search || filters.source !== "all" || filters.app_id,
  );
  const reset = () => {
    setSearch("");
    setFilters(INITIAL_FILTERS);
  };
  const busy = pageQuery.isFetching || search.trim() !== filters.search;

  return (
    <Section
      title="AI Skills"
      description="Skills guide how Integral handles tasks in this workspace."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<SlidersHorizontal size={15} />}
            onClick={() => setContextOpen(true)}
            disabled={!workspaceId}
          >
            Inspect agent access
          </Button>
          {canManage ? (
            <Button
              size="sm"
              icon={<Plus size={15} />}
              onClick={() => setEditorId("__new__")}
            >
              New skill
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-0 flex-1 basis-64">
          <Text
            as="span"
            tone="subtle"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          >
            <Search size={16} aria-hidden />
          </Text>
          <Input
            value={search}
            maxLength={120}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search skill names…"
            aria-label="Search skill names"
            style={{ paddingLeft: "2.25rem" }}
          />
        </div>
        <Select
          aria-label="Skill source"
          className="w-full sm:w-auto"
          value={filters.source}
          onChange={(event) =>
            changeSource(event.target.value as SkillBrowseQuery["source"])
          }
        >
          <option value="all">All skills</option>
          <option value="app">App skills</option>
          <option value="workspace">Workspace skills</option>
          <option value="core">Built-in skills</option>
        </Select>
        {filters.source !== "core" &&
        filters.source !== "workspace" &&
        Boolean(data?.apps.length) ? (
          <Select
            aria-label="Filter by App"
            className="w-full sm:max-w-48 sm:w-auto"
            value={filters.app_id}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                app_id: event.target.value,
                page: 1,
              }))
            }
          >
            <option value="">All Apps</option>
            {data?.apps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </Select>
        ) : null}
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            Clear filters
          </Button>
        ) : null}
      </div>

      <div aria-busy={busy}>
        {pageQuery.isPending ? (
          <Stack gap="sm">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </Stack>
        ) : pageQuery.isError ? (
          <EmptyState
            title="Could not load skills"
            description="Try loading this page again."
            action={
              <Button
                variant="secondary"
                onClick={() => void pageQuery.refetch()}
              >
                Try again
              </Button>
            }
          />
        ) : data ? (
          <Stack gap="sm">
            <div role="status">
              <Text
                as="p"
                variant="meta"
                tone="muted"
                className="flex items-center justify-between gap-2"
              >
                <span>
                  {data.total} {data.total === 1 ? "skill" : "skills"}
                  {filtered ? " matching your filters" : " in this workspace"}
                </span>
                {busy ? <span>Updating…</span> : null}
              </Text>
            </div>
            {data.skills.length ? (
              <Surface
                border="subtle"
                radius="card"
                className="overflow-hidden"
              >
                <ul
                  aria-label="Skills"
                  className="divide-y divide-[var(--border-subtle)]"
                >
                  {data.skills.map((skill) => (
                    <Surface
                      as="li"
                      key={skill.id}
                      tone="transparent"
                      border="none"
                      radius="none"
                      hoverTone="panel-2"
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditorId(skill.id)}
                        aria-label={`View skill ${skill.name}`}
                        className="group min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Text as="span" variant="body" weight="medium">
                            {skill.name}
                          </Text>
                          {skill.customized ? (
                            <Badge variant="ai">Customized</Badge>
                          ) : null}
                          {skill.stale_default ? (
                            <Badge variant="warning">Update available</Badge>
                          ) : null}
                        </div>
                        <Text
                          as="p"
                          variant="body-sm"
                          tone="muted"
                          className="mt-0.5 line-clamp-2"
                        >
                          {skill.description ||
                            "Open to read this skill’s instructions."}
                        </Text>
                        <Text
                          as="p"
                          variant="meta"
                          tone="subtle"
                          className="mt-1 flex flex-wrap items-center gap-1"
                        >
                          {skill.source === "core" ? (
                            <>
                              <Lock size={11} aria-hidden />
                              Built-in · Read only
                            </>
                          ) : skill.source === "workspace" ? (
                            "Workspace skill"
                          ) : (
                            skill.app_name || skill.app_slug || "App skill"
                          )}
                          {skill.private ? <span>· App only</span> : null}
                        </Text>
                      </button>
                      {canManage && skill.source !== "core" ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={skill.enabled}
                          aria-label={`${skill.enabled ? "Disable" : "Enable"} skill ${skill.name}`}
                          disabled={toggle.isPending || busy}
                          onClick={() => toggle.mutate(skill)}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] disabled:opacity-50"
                        >
                          <span
                            aria-hidden
                            className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${skill.enabled ? "bg-[var(--brand-accent)]" : "bg-[var(--badge-muted-bg)]"}`}
                          >
                            <span
                              className={`h-4 w-4 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform ${skill.enabled ? "translate-x-[18px]" : "translate-x-[2px]"}`}
                            />
                          </span>
                        </button>
                      ) : skill.source !== "core" ? (
                        <Text variant="meta" tone="muted">
                          {skill.enabled ? "Enabled" : "Disabled"}
                        </Text>
                      ) : null}
                      <Text as="span" tone="subtle" className="shrink-0">
                        <ChevronRight size={15} aria-hidden />
                      </Text>
                    </Surface>
                  ))}
                </ul>
              </Surface>
            ) : (
              <EmptyState
                title={filtered ? "No matching skills" : "No skills yet"}
                description={
                  filtered
                    ? "Try another name or clear the filters."
                    : "Skills from installed Apps will appear here."
                }
              />
            )}
            {data.total > 0 ? (
              <SkillPagination
                page={data.page}
                pages={data.total_pages}
                total={data.total}
                pageSize={data.page_size}
                busy={busy}
                onPage={(page) =>
                  setFilters((current) => ({ ...current, page }))
                }
                label="Skills pages"
              />
            ) : null}
          </Stack>
        ) : null}
      </div>

      <Modal
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        title="Agent access"
        titleIcon={<SlidersHorizontal size={18} />}
      >
        {contextOpen && workspaceId ? (
          <SkillContextInspector workspaceId={workspaceId} />
        ) : null}
      </Modal>
      <SkillEditorModal
        open={editorId !== null}
        skillId={editorId}
        canManage={canManage}
        onClose={closeEditor}
        onSaved={savedSkill}
      />
    </Section>
  );
}
