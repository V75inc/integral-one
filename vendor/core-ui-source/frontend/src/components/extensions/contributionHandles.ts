import type {ContributionLifecycleHandle, ContributionSubmitResult} from '../entries/contributionLifecycle';
/** Stop on the first failure; preserve evidence of earlier recorded work. */
export async function runContributionHandles(handles: Iterable<ContributionLifecycleHandle>, action: 'validate' | 'submit', entryId?: string | null, active: () => boolean = () => true): Promise<ContributionSubmitResult> {
  let outcomeRecorded = false;
  for (const handle of [...handles]) {
    if (!active()) return {ok: false, error: 'This form is no longer active.', outcomeRecorded};
    let result: ContributionSubmitResult;
    try {
      result = action === 'validate' ? await handle.requestValidate() : await handle.requestSubmit(entryId);
    } catch (error) {
      return {ok: false, error: error instanceof Error ? error.message : 'The form region could not be completed.', outcomeRecorded};
    }
    outcomeRecorded ||= Boolean('outcomeRecorded' in result && result.outcomeRecorded);
    if (!active()) return {ok: false, error: 'This form is no longer active.', outcomeRecorded};
    if (!result.ok) return {...result, outcomeRecorded};
  }
  return {ok: true, outcomeRecorded};
}
