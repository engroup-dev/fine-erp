import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backupsApi, Backup, isRunConnectionLost } from "../api/endpoints/backups";
import { downloadBlob } from "../lib/utils/csv";
import { useAuthStore } from "../stores/authStore";
import { retryUnlessClientError } from "./useOperatingUnits";

const BACKUPS_KEY = ["backups"] as const;

/**
 * Mirrors BackupController::ensureOwner: an owner role bound to no unit. The route's
 * require.role:owner also lets admins through, but the controller answers them 403.
 */
export function useIsCompanyWideOwner(): boolean {
  const user = useAuthStore((s) => s.user);
  return Boolean(user?.roles?.some((r) => r.slug === "owner" && r.pivot !== undefined && r.pivot.operating_unit_id === null));
}

/** W6-03: GET /backups — the newest 200 backups (company-wide owner only). */
export function useBackups(enabled = true) {
  return useQuery({
    queryKey: BACKUPS_KEY,
    queryFn: backupsApi.list,
    enabled,
    retry: retryUnlessClientError,
  });
}

/** After a lost connection the dump may still finish on the server: look again later. */
const LOST_RUN_REFETCH_DELAYS_MS = [30_000, 2 * 60_000, 5 * 60_000, 16 * 60_000];

/**
 * W6-03: POST /backups — take a backup now. A failed dump still leaves a failed row
 * (422 BACKUP_FAILED), so the list is refreshed either way. Backups are audited.
 * When the request ends without an answer (timeout, dropped connection, proxy 50x)
 * the server may still be taking the backup, so the list is refreshed again over the
 * next minutes for the row to show up.
 */
export function useRunBackup() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: BACKUPS_KEY });
    qc.invalidateQueries({ queryKey: ["auditLog"] });
  };
  return useMutation({
    mutationFn: () => backupsApi.run(),
    onError: (err) => {
      if (!isRunConnectionLost(err)) return;
      for (const delay of LOST_RUN_REFETCH_DELAYS_MS) setTimeout(refresh, delay);
    },
    onSettled: refresh,
  });
}

/**
 * W6-03: GET /backups/{id}/download — fetches the .gz file as a blob and saves it
 * under the server's file name. Only the name and checksum are returned, so the
 * (possibly very large) blob is not held in the mutation's state or cache.
 */
export function useDownloadBackup() {
  return useMutation({
    mutationFn: async (backup: Backup): Promise<{ fileName: string; checksum: string | null }> => {
      const { blob, fileName, checksum } = await backupsApi.download(backup);
      downloadBlob(fileName, blob);
      return { fileName, checksum };
    },
  });
}

/** W6-03: DELETE /backups/{id} — the row is soft-deleted and its file removed. */
export function useDeleteBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backupsApi.remove(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: BACKUPS_KEY });
      qc.invalidateQueries({ queryKey: ["auditLog"] });
    },
  });
}
