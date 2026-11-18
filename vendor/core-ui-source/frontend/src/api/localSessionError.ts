import axios from 'axios';

/** Request was stopped before dispatch because the local host has no valid session. */
export class LocalWorkspaceReconnectingError extends axios.CanceledError<unknown> {
  constructor(readonly mountAttemptGeneration?: number) { super('Local workspace is reconnecting'); }
}
