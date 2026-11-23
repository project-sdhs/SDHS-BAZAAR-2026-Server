export type GoogleGroupSyncStatus = 'running' | 'succeeded' | 'failed';

export interface GoogleGroupSyncRun {
  id: number;
  startedByAdminId: number;
  status: GoogleGroupSyncStatus;
  finishedAt: string | null;
  resultSummary: unknown;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
