import { isAxiosError } from "axios";
import apiClient from "../client";

/**
 * W6-03: database backups (BackupController::payload). Only the company-wide owner
 * (an owner role bound to no unit) gets in; everyone else gets 403 BACKUP_FORBIDDEN.
 * There is no restore endpoint: restoring is done on the server from a downloaded file.
 */
export type BackupStatus = "completed" | "failed";
export type BackupTrigger = "manual" | "scheduled";

export interface Backup {
  id: string;
  /** The file name on the private backups disk (fine-backup-<utc>-<rand>.<sqlite|dump>.gz). */
  file: string;
  size_bytes: number | null;
  /** SHA-256 of the .gz archive; null on a failed backup. */
  checksum: string | null;
  /** The database driver dumped: sqlite or pgsql. */
  driver: string;
  status: BackupStatus;
  /** Arabic label (مكتملة / فاشلة). */
  status_label: string;
  error: string | null;
  trigger: BackupTrigger;
  /** Arabic label (يدوية / مجدولة). */
  trigger_label: string;
  /** Who started it; null for a scheduled run. */
  user: { id: string; name: string } | null;
  started_at: string | null;
  completed_at: string | null;
  /** Set by the last successful restore test (backup:verify); null otherwise. */
  verified_at: string | null;
  /** The last restore test's failure; null when it passed or never ran. */
  verify_error: string | null;
  created_at: string | null;
}

export interface BackupDownload {
  blob: Blob;
  /** The server's file name (Content-Disposition), else the row's file name. */
  fileName: string;
  /** X-Backup-Checksum-Sha256: the archive's SHA-256 as recorded on the server. */
  checksum: string | null;
}

/**
 * POST /backups dumps the database synchronously (the server allows the dump up to
 * config('backups.timeout') + 120 s), so the client's 15 s default would give up long
 * before a large backup finishes. This assumes the default BACKUP_TIMEOUT of 900 s; a
 * server configured higher, or a proxy that cuts the request sooner, ends the request
 * early while the dump carries on — see isRunConnectionLost().
 */
const RUN_TIMEOUT_MS = (900 + 120 + 60) * 1000;

/**
 * True when POST /backups ended without an answer from the backup itself: the client
 * timed out, the connection dropped, or a proxy answered 502/504 (often an HTML page).
 * A 503 is left to the normal error path: Laravel answers it in maintenance mode, when
 * no backup started. The server may still be taking the backup and record it a little later, so
 * this must not be reported as a failed backup.
 */
export const isRunConnectionLost = (err: unknown): boolean => {
  if (!isAxiosError(err)) return false;
  const code = (err.response?.data as { code?: unknown } | undefined)?.code;
  if (typeof code === "string" && code.startsWith("BACKUP_")) return false;
  return !err.response || err.code === "ECONNABORTED" || err.code === "ETIMEDOUT" || err.response.status === 502 || err.response.status === 504;
};
/** A large archive over a slow line; the server streams it. */
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

/** `attachment; filename="x"` or `filename*=UTF-8''x` → x. */
const fileNameFromDisposition = (header: unknown): string | null => {
  if (typeof header !== "string") return null;
  const encoded = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // fall through to the plain filename
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/.exec(header);
  const name = (plain?.[2] ?? plain?.[1])?.trim();
  return name ? name : null;
};

/**
 * A blob request's error body arrives as a Blob too. Turn it back into the JSON the
 * server sent so apiErrorMessage() can read its `code` (BACKUP_FILE_MISSING, …).
 */
const withJsonErrorBody = async (err: unknown): Promise<never> => {
  const response = (err as { response?: { data?: unknown } } | undefined)?.response;
  if (response && response.data instanceof Blob) {
    try {
      response.data = JSON.parse(await response.data.text());
    } catch {
      response.data = undefined;
    }
  }
  throw err;
};

export const backupsApi = {
  list: async (): Promise<Backup[]> => (await apiClient.get<{ data: Backup[] }>("/backups")).data.data,

  /** 201 with the new backup; a failed dump answers 422 BACKUP_FAILED (the failed row is kept). */
  run: async (): Promise<Backup> =>
    (await apiClient.post<{ data: Backup }>("/backups", undefined, { timeout: RUN_TIMEOUT_MS })).data.data,

  /** Streams the .gz file through the authenticated client (Bearer token), as a blob. */
  download: async (backup: Backup): Promise<BackupDownload> => {
    try {
      const res = await apiClient.get<Blob>(`/backups/${backup.id}/download`, {
        responseType: "blob",
        // Accept stays application/json (the client default) so a refusal still comes back as JSON.
        timeout: DOWNLOAD_TIMEOUT_MS,
      });
      const checksum = res.headers["x-backup-checksum-sha256"];
      return {
        blob: res.data,
        fileName: fileNameFromDisposition(res.headers["content-disposition"]) ?? backup.file,
        checksum: typeof checksum === "string" && checksum !== "" ? checksum : backup.checksum,
      };
    } catch (err) {
      return withJsonErrorBody(err);
    }
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/backups/${id}`);
  },
};
