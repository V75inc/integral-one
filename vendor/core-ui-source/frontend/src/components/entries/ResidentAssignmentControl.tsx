import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { entriesApi, type ResidentAssignmentState } from '../../api/entries';
import { workspacesApi } from '../../api/workspaces';
import { errorMessageFromAxios } from '../../api/helpers';
import { Button, Pill } from '../ui';
import { Text } from '../../ui';

const readinessLabels = {
  paused: 'Assignment intake is disabled',
  needs_reassignment: 'Needs reassignment',
  needs_task_setup: 'Needs task setup',
  awaiting_execution_policy: 'Awaiting execution policy',
};

export function useResidentAssignmentEnabled(workspaceId?: string | null) {
  return useQuery({
    queryKey: ['workspace-resident-assignment-settings', workspaceId],
    queryFn: () => workspacesApi.getResidentAssignmentSettings(workspaceId!),
    enabled: Boolean(workspaceId),
    retry: false,
  }).data?.enabled === true;
}

export function ResidentAssignmentControl({
  entryId,
  workspaceId,
  compact = false,
}: {
  entryId: string;
  workspaceId: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ['entry-resident-assignment', workspaceId, entryId];
  const assignment = useQuery({
    queryKey,
    queryFn: () => entriesApi.getResidentAssignment(entryId, workspaceId),
    enabled: !compact || open,
    retry: false,
  });
  const change = useMutation({
    mutationFn: ({ state, revision }: { state: ResidentAssignmentState; revision: number }) =>
      entriesApi.setResidentAssignment(entryId, workspaceId, state, revision),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const current = assignment.data;
  const assigned = current?.state === 'assigned';

  if (!compact && !assigned && !current?.can_assign) return null;

  return (
    <div
      className={compact ? "flex flex-wrap items-center gap-1.5 px-2 pb-2" : "flex flex-wrap items-center gap-1.5"}
      onClick={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onTouchStart={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    >
      {compact ? (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          onClick={() => {
            change.reset();
            setOpen(value => !value);
          }}
        >
          {assigned ? 'Assigned to Integral' : 'Resident assignment'}
        </Button>
      ) : assigned ? <Pill tone="descriptive">Assigned to Integral</Pill> : null}
      {(!compact || open) && (
        <>
          {current?.readiness ? (
            <Text variant="meta">{readinessLabels[current.readiness]}</Text>
          ) : null}
          {assigned && !compact && current ? (
            <ResidentAssignmentReviewControl
              entryId={entryId}
              workspaceId={workspaceId}
              revision={current.revision}
              canRequest={current.can_request_review === true}
            />
          ) : null}
          {assignment.isPending ? <Text variant="meta">Loading assignment…</Text> : null}
          {assignment.isError ? <Text variant="meta">Assignment unavailable.</Text> : null}
          {compact && current && !assigned && !current.can_assign ? (
            <Text variant="meta">Assignment is unavailable for this Entry.</Text>
          ) : null}
          {current && (current.can_assign || current.can_withdraw) ? (
            <Button
              variant="outline"
              size="sm"
              disabled={change.isPending || assignment.isFetching}
              onClick={() => change.mutate({
                state: assigned ? 'withdrawn' : 'assigned',
                revision: current.revision,
              })}
            >
              {assigned ? 'Withdraw assignment' : 'Assign to Integral'}
            </Button>
          ) : null}
          {change.isError ? (
            <div role="alert">
              <Text variant="meta">
                {errorMessageFromAxios(change.error, 'Could not update resident assignment.')}
              </Text>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}


function ResidentAssignmentReviewControl({
  entryId,
  workspaceId,
  revision,
  canRequest,
}: {
  entryId: string;
  workspaceId: string;
  revision: number;
  canRequest: boolean;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ['entry-resident-assignment-review', workspaceId, entryId, revision];
  const review = useQuery({
    queryKey,
    queryFn: () => entriesApi.getResidentAssignmentReview(entryId, workspaceId),
    enabled: open,
    retry: false,
    refetchInterval: query => {
      const data = query.state.data;
      return data?.approval_status === 'approved' &&
        ['waiting_for_human', 'queued', 'running', 'retry_wait'].includes(data.status)
        ? 5000 : false;
    },
  });
  const request = useMutation({
    mutationFn: () => entriesApi.requestResidentAssignmentReview(entryId, workspaceId, revision),
    onSuccess: data => queryClient.setQueryData(queryKey, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const placement = useMutation({
    mutationFn: (digest: string) => entriesApi.stageResidentAssignmentPlacement(entryId, workspaceId, digest),
  });
  const approve = useMutation({
    mutationFn: (digest: string) => entriesApi.approveResidentAssignmentReview(entryId, workspaceId, digest),
    onSuccess: data => queryClient.setQueryData(queryKey, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const data = review.data;
  return (
    <div className="basis-full space-y-1">
      <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        Preparation review
      </Button>
      {open && (
        <div className="space-y-1">
          {review.isPending ? <Text as="p" variant="meta">Loading review…</Text> : null}
          {review.isError ? <Text as="p" variant="meta">Review unavailable.</Text> : null}
          {data === null && canRequest ? (
            <Button
              variant="outline"
              size="sm"
              disabled={request.isPending || review.isFetching}
              onClick={() => request.mutate()}
            >
              Request preparation review
            </Button>
          ) : null}
          {data === null && !canRequest ? (
            <Text as="p" variant="meta">No review is available for this assignment.</Text>
          ) : null}
          {request.isError ? (
            <div role="alert">
              <Text variant="meta">{errorMessageFromAxios(request.error, 'Could not request preparation.')}</Text>
            </div>
          ) : null}
          {data ? (
            <>
              <Text as="p" variant="body-sm">
                {data.model} via {data.provider} · Up to {data.max_model_requests} model requests · USD {data.max_spend_usd}
              </Text>
              <Text as="p" variant="meta">
                Expires {new Date(data.deadline_at).toLocaleString()}
              </Text>
              <Text as="p" variant="meta">
                {data.needs_model_evidence ? 'Approved. Ask your operator to configure model pricing and request limits.'
                  : data.status === 'succeeded' ? 'Private draft prepared'
                  : data.status === 'waiting_for_human' && data.approval_status === 'approved' ? 'Approved. Awaiting queue admission.'
                  : data.status === 'waiting_for_human' && data.approval_status === 'pending' ? 'Awaiting review'
                  : data.status.replace(/_/g, ' ')}
              </Text>
              {data.preparation_thread_id ? (
                <Link to={`/agent?thread=${encodeURIComponent(data.preparation_thread_id)}`}>
                  <Text variant="body-sm" tone="brand" className="underline">Open private draft</Text>
                </Link>
              ) : null}
              {data.preparation_thread_id ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={placement.isPending || placement.isSuccess}
                  onClick={() => placement.mutate(data.review_digest)}
                >
                  Propose adding draft to Entry
                </Button>
              ) : null}
              {placement.isSuccess ? (
                <Link to="/approvals">
                  <Text variant="body-sm" tone="brand" className="underline">Review proposed Entry update</Text>
                </Link>
              ) : null}
              {data.can_approve ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={approve.isPending || review.isFetching}
                  onClick={() => approve.mutate(data.review_digest)}
                >
                  Approve private preparation
                </Button>
              ) : null}
            </>
          ) : null}
          {placement.isError ? (
            <div role="alert">
              <Text variant="meta">{errorMessageFromAxios(placement.error, 'Could not propose the Entry update.')}</Text>
            </div>
          ) : null}
          {approve.isError ? (
            <div role="alert">
              <Text variant="meta">{errorMessageFromAxios(approve.error, 'Could not approve preparation.')}</Text>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
