import React, { useMemo, useState } from "react";
import {
  CalendarClock,
  Copy,
  DatabaseBackup,
  Download,
  Info,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
} from "lucide-react";
import { isRunConnectionLost, type Backup } from "../../api/endpoints/backups";
import { apiErrorMessage, apiErrorPayload, LEDGER_ERROR_MESSAGE } from "../../api/endpoints/production";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DataTable, useDataTable, type ColumnDef } from "../../components/ui/DataTable";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/Dialog";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  useBackups,
  useDeleteBackup,
  useDownloadBackup,
  useIsCompanyWideOwner,
  useRunBackup,
} from "../../hooks/useBackups";
import { formatDateTime, formatNumber } from "../../lib/utils/format";
import { toast } from "../../stores/toastStore";

/** 1536 → "1.5 ك.ب" (binary units, Latin digits). */
const formatBytes = (bytes: number | null): string => {
  if (bytes === null || !Number.isFinite(bytes)) return "—";
  const units = ["بايت", "ك.ب", "م.ب", "ج.ب"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${formatNumber(value, { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
};

const backupTime = (b: Backup): string | null => b.completed_at ?? b.started_at ?? b.created_at;

/** "skipped": the restore test could not run (the server is not set up for it), not a failure. */
type VerifyState = "verified" | "failed" | "skipped" | "untested" | "none";

interface VerifyInfo {
  state: VerifyState;
  /** Arabic reason for a failed or skipped test. */
  reason: string | null;
  /** The server's own (English) detail, for the tooltip and the export. */
  detail: string | null;
}

/**
 * BackupService::verifyLocked stores "<CODE>: <message>" when the test cannot run
 * (BACKUP_VERIFY_NOT_CONFIGURED / BACKUP_VERIFY_SCRATCH_IS_SOURCE), and the bare
 * message for a real failure (checksum mismatch, restore or integrity error).
 */
const VERIFY_ERROR_CODE = /^(BACKUP_[A-Z_]+):\s*/;
const VERIFY_NOT_RUN_CODES = new Set(["BACKUP_VERIFY_NOT_CONFIGURED", "BACKUP_VERIFY_SCRATCH_IS_SOURCE"]);

/** The restore test's outcome on this row (backup:verify records verified_at or verify_error). */
const verifyInfo = (b: Backup): VerifyInfo => {
  if (b.status !== "completed") return { state: "none", reason: null, detail: null };
  if (b.verified_at) return { state: "verified", reason: null, detail: null };
  if (!b.verify_error) return { state: "untested", reason: null, detail: null };

  const match = VERIFY_ERROR_CODE.exec(b.verify_error);
  const code = match?.[1] ?? null;
  const detail = match ? b.verify_error.slice(match[0].length) : b.verify_error;
  const reason = (code && LEDGER_ERROR_MESSAGE[code]) || LEDGER_ERROR_MESSAGE.BACKUP_VERIFY_FAILED;
  return { state: code && VERIFY_NOT_RUN_CODES.has(code) ? "skipped" : "failed", reason, detail: detail || null };
};

const verifyTooltip = (info: VerifyInfo): string | undefined =>
  [info.reason, info.detail].filter(Boolean).join("\n") || undefined;

const VerifyCell: React.FC<{ backup: Backup }> = ({ backup }) => {
  const info = verifyInfo(backup);
  switch (info.state) {
    case "verified":
      return (
        <span className="inline-flex items-center gap-1 text-app-status-positive" title="نجح اختبار الاستعادة لهذه النسخة">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold">تم التحقق</span>
          <span className="font-mono text-[10px] text-app-label-secondary">{formatDateTime(backup.verified_at as string)}</span>
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 text-app-status-danger" title={verifyTooltip(info)}>
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold">فشل اختبار الاستعادة</span>
        </span>
      );
    case "skipped":
      return (
        <span className="inline-flex max-w-[16rem] flex-col gap-0.5" title={verifyTooltip(info)}>
          <span className="inline-flex items-center gap-1 text-app-status-orange">
            <ShieldQuestion className="h-3.5 w-3.5 shrink-0" />
            <span className="font-semibold">تعذّر إجراء اختبار الاستعادة</span>
          </span>
          <span className="text-[10px] leading-snug text-app-label-secondary">{info.reason}</span>
        </span>
      );
    case "untested":
      return (
        <span className="inline-flex items-center gap-1 text-app-label-secondary" title="لم يُجرَ اختبار استعادة لهذه النسخة بعد">
          <ShieldQuestion className="h-3.5 w-3.5 shrink-0" />
          لم تُختبر بعد
        </span>
      );
    default:
      return <span className="text-app-label-tertiary">—</span>;
  }
};

/** BACKUP_FAILED carries the failed row; say why the dump failed. */
const runErrorMessage = (err: unknown): string => {
  if (isRunConnectionLost(err)) {
    return "انقطع الاتصال قبل انتهاء النسخ — قد تكون النسخة ما زالت تُؤخذ على الخادم. ستُحدَّث القائمة تلقائياً خلال الدقائق القادمة؛ تحقّق منها قبل إعادة المحاولة.";
  }
  const message = apiErrorMessage(err, "تعذّر أخذ النسخة الاحتياطية.");
  const payload = apiErrorPayload(err) as { code?: string; backup?: Backup } | undefined;
  if (payload?.code === "BACKUP_FAILED" && payload.backup?.error) {
    return `${message} السبب: ${payload.backup.error}`;
  }
  return message;
};

interface DownloadedFile {
  fileName: string;
  checksum: string | null;
}

const ChecksumDialog: React.FC<{ file: DownloadedFile; onClose: () => void }> = ({ file, onClose }) => {
  const copy = async () => {
    if (!file.checksum) return;
    try {
      await navigator.clipboard.writeText(file.checksum);
      toast.success("نُسخت البصمة");
    } catch {
      toast.error("تعذّر النسخ — حدّد البصمة وانسخها يدوياً.");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle>تنزيل النسخة الاحتياطية</DialogTitle>
            <DialogClose />
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4 text-xs">
          <div>
            <div className="mb-1 text-[11px] font-semibold text-app-label-secondary">اسم الملف</div>
            <div dir="ltr" className="break-all rounded-lg bg-app-bg-secondary p-2 font-mono text-[11px] text-app-label-primary text-start">
              {file.fileName}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold text-app-label-secondary">بصمة SHA-256 المسجلة على الخادم</div>
            {file.checksum ? (
              <div className="flex items-start gap-2">
                <div dir="ltr" className="flex-1 select-all break-all rounded-lg bg-app-bg-secondary p-2 font-mono text-[11px] text-app-label-primary text-start">
                  {file.checksum}
                </div>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-app-separator px-2 py-2 text-[11px] font-semibold text-app-label-primary hover:bg-app-fill-f1"
                >
                  <Copy className="h-3.5 w-3.5" />
                  نسخ
                </button>
              </div>
            ) : (
              <div className="text-app-label-secondary">لم يرسل الخادم بصمة لهذا الملف.</div>
            )}
          </div>
          <p className="leading-relaxed text-app-label-secondary">
            بعد حفظ الملف تأكد أن بصمته تطابق البصمة أعلاه قبل الاعتماد عليه أو استعادته — على Windows:{" "}
            <code dir="ltr" className="font-mono">Get-FileHash -Algorithm SHA256 &lt;الملف&gt;</code>، وعلى Linux:{" "}
            <code dir="ltr" className="font-mono">sha256sum &lt;الملف&gt;</code>.
          </p>
        </DialogBody>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-app-accent px-5 py-2 text-xs font-bold text-white hover:opacity-90"
          >
            تم
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const RestoreStep: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <li className="flex gap-3">
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-app-accent/15 text-[10px] font-bold text-app-accent">
      {n}
    </span>
    <div className="flex-1 leading-relaxed">{children}</div>
  </li>
);

const Cmd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code dir="ltr" className="mt-1 block break-all rounded-lg bg-app-bg-secondary px-2 py-1 font-mono text-[11px] text-app-label-primary text-start">
    {children}
  </code>
);

/**
 * W6-03: Settings › Company › backups — the company-wide owner lists the database
 * backups, takes one now, downloads one (a blob through the authenticated client),
 * deletes one, and reads the schedule and the restore steps. There is no in-app restore.
 */
export const BackupsPage: React.FC = () => {
  const isOwner = useIsCompanyWideOwner();
  const backupsQuery = useBackups(isOwner);
  const runMutation = useRunBackup();
  const downloadMutation = useDownloadBackup();
  const deleteMutation = useDeleteBackup();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<DownloadedFile | null>(null);
  const [deleting, setDeleting] = useState<Backup | null>(null);

  const backups = useMemo(() => backupsQuery.data ?? [], [backupsQuery.data]);
  const lastCompleted = backups.find((b) => b.status === "completed");
  const lastVerified = backups
    .filter((b) => b.verified_at)
    .sort((a, b) => (b.verified_at as string).localeCompare(a.verified_at as string))[0];

  const handleRun = async () => {
    try {
      const backup = await runMutation.mutateAsync();
      toast.success(`تم أخذ النسخة الاحتياطية (${formatBytes(backup.size_bytes)})`);
    } catch (err) {
      if (isRunConnectionLost(err)) toast.warning(runErrorMessage(err), 15000);
      else toast.error(runErrorMessage(err));
    }
  };

  const handleDownload = async (backup: Backup) => {
    setDownloadingId(backup.id);
    try {
      setDownloaded(await downloadMutation.mutateAsync(backup));
    } catch (err) {
      toast.error(apiErrorMessage(err, "تعذّر تنزيل النسخة الاحتياطية."));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      toast.success("حُذفت النسخة الاحتياطية");
      setDeleting(null);
    } catch (err) {
      toast.error(apiErrorMessage(err, "تعذّر حذف النسخة الاحتياطية."));
    }
  };

  const columns = useMemo<ColumnDef<Backup>[]>(
    () => [
      {
        id: "time",
        header: "التاريخ",
        cell: ({ row }) => {
          const t = backupTime(row.original);
          return <span className="font-mono text-[11px] whitespace-nowrap">{t ? formatDateTime(t) : "—"}</span>;
        },
        meta: { exportValue: (b: Backup) => backupTime(b) },
      },
      {
        id: "status",
        header: "الحالة",
        cell: ({ row }) => (
          <span title={row.original.error ?? undefined}>
            <StatusBadge
              status={row.original.status}
              label={row.original.status_label}
              variant={row.original.status === "completed" ? "positive" : "danger"}
            />
          </span>
        ),
        meta: { exportValue: (b: Backup) => b.status_label },
      },
      {
        id: "trigger",
        header: "المصدر",
        cell: ({ row }) => (
          <span>
            {row.original.trigger_label}
            {row.original.user && <span className="text-app-label-secondary"> — {row.original.user.name}</span>}
          </span>
        ),
        meta: { exportValue: (b: Backup) => (b.user ? `${b.trigger_label} — ${b.user.name}` : b.trigger_label) },
      },
      {
        id: "size",
        header: "الحجم",
        cell: ({ row }) => <span className="font-mono whitespace-nowrap">{formatBytes(row.original.size_bytes)}</span>,
        meta: { exportValue: (b: Backup) => b.size_bytes },
      },
      {
        id: "driver",
        header: "قاعدة البيانات",
        cell: ({ row }) => <span className="font-mono text-[11px]">{row.original.driver}</span>,
        meta: { exportValue: (b: Backup) => b.driver },
      },
      {
        id: "verify",
        header: "اختبار الاستعادة",
        cell: ({ row }) => <VerifyCell backup={row.original} />,
        meta: {
          exportValue: (b: Backup) => {
            const info = verifyInfo(b);
            const detail = info.detail ? ` (${info.detail})` : "";
            if (info.state === "verified") return `تم التحقق ${formatDateTime(b.verified_at as string)}`;
            if (info.state === "failed") return `فشل اختبار الاستعادة: ${info.reason}${detail}`;
            if (info.state === "skipped") return `تعذّر إجراء اختبار الاستعادة: ${info.reason}`;
            if (info.state === "untested") return "لم تُختبر بعد";
            return null;
          },
        },
      },
      {
        id: "checksum",
        header: "البصمة (SHA-256)",
        cell: ({ row }) =>
          row.original.checksum ? (
            <span dir="ltr" className="font-mono text-[10px] text-app-label-secondary" title={row.original.checksum}>
              {row.original.checksum.slice(0, 12)}…
            </span>
          ) : (
            <span className="text-app-label-tertiary">—</span>
          ),
        meta: { exportValue: (b: Backup) => b.checksum },
      },
      {
        id: "actions",
        header: "",
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const b = row.original;
          const isDownloading = downloadingId === b.id;
          return (
            <div className="flex items-center justify-end gap-1">
              {b.status === "completed" && (
                <button
                  type="button"
                  onClick={() => void handleDownload(b)}
                  disabled={downloadingId !== null}
                  title="تنزيل الملف"
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-app-accent hover:bg-app-accent/10 disabled:opacity-50"
                >
                  {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  تنزيل
                </button>
              )}
              <button
                type="button"
                onClick={() => setDeleting(b)}
                title="حذف النسخة"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-app-status-danger hover:bg-app-status-danger/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                حذف
              </button>
            </div>
          );
        },
      },
    ],
    // handleDownload reads only downloadingId and stable mutation/state setters.
    [downloadingId],
  );

  const table = useDataTable({
    exportFileName: "backups",
    columns,
    data: backups,
    pageSize: 20,
    getRowId: (b) => b.id,
  });

  if (!isOwner) {
    return (
      <div className="p-16 text-center text-xs text-app-status-danger" dir="rtl">
        النسخ الاحتياطية تضم سجلات كل الوحدات، فإدارتها من صلاحية المالك على مستوى الشركة فقط.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-app-label-primary">
            <DatabaseBackup className="h-7 w-7 text-app-accent" />
            النسخ الاحتياطية
          </h1>
          <p className="mt-1 text-xs text-app-label-secondary">
            نسخ كاملة من قاعدة البيانات (كل الوحدات) محفوظة في مكان خاص على الخادم، مضغوطة ومعها بصمة SHA-256.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={runMutation.isPending}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
            {runMutation.isPending ? "جارٍ أخذ النسخة…" : "نسخة احتياطية الآن"}
          </button>
          {runMutation.isPending && (
            <span className="text-[10px] text-app-label-secondary">قد يستغرق ذلك بضع دقائق — لا تغلق البرنامج.</span>
          )}
        </div>
      </div>

      {/* Schedule (read-only: set on the server) */}
      <section className="space-y-3 rounded-2xl border border-app-separator bg-app-bg-primary p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-app-label-primary">
          <CalendarClock className="h-4 w-4 text-app-accent" />
          الجدول الآلي
        </h2>
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-xl bg-app-bg-secondary p-3">
            <div className="font-bold text-app-label-primary">نسخة ليلية</div>
            <div className="mt-1 text-app-label-secondary">
              كل يوم الساعة <span className="font-mono">02:00</span> بتوقيت طرابلس.
            </div>
          </div>
          <div className="rounded-xl bg-app-bg-secondary p-3">
            <div className="font-bold text-app-label-primary">الاحتفاظ</div>
            <div className="mt-1 text-app-label-secondary">
              آخر نسخة من كل يوم لآخر <span className="font-mono">14</span> يوماً، ومن كل أسبوع لآخر{" "}
              <span className="font-mono">8</span> أسابيع؛ وتُحذف الأقدم تلقائياً (الساعة <span className="font-mono">03:00</span>).
            </div>
          </div>
          <div className="rounded-xl bg-app-bg-secondary p-3">
            <div className="font-bold text-app-label-primary">اختبار استعادة شهري</div>
            <div className="mt-1 text-app-label-secondary">
              يوم <span className="font-mono">1</span> من كل شهر الساعة <span className="font-mono">04:00</span>: تُستعاد أحدث
              نسخة في قاعدة تجريبية وتُفحص، وتظهر النتيجة في عمود «اختبار الاستعادة».
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-app-label-secondary">
          <span>
            آخر نسخة مكتملة:{" "}
            <span className="font-mono text-app-label-primary">
              {lastCompleted && backupTime(lastCompleted) ? formatDateTime(backupTime(lastCompleted) as string) : "—"}
            </span>
          </span>
          <span>
            آخر اختبار استعادة ناجح:{" "}
            <span className="font-mono text-app-label-primary">
              {lastVerified ? formatDateTime(lastVerified.verified_at as string) : "—"}
            </span>
          </span>
        </div>
        <p className="flex items-center gap-1 text-[10px] text-app-label-secondary">
          <Info className="h-3 w-3 shrink-0" />
          للعرض فقط — المواعيد وعدد النسخ المحفوظة مضبوطة على الخادم.
        </p>
      </section>

      {backupsQuery.isError ? (
        <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-10 text-center text-xs text-app-status-danger">
          {apiErrorMessage(backupsQuery.error, "تعذّر تحميل النسخ الاحتياطية.")}
        </div>
      ) : (
        <DataTable table={table}>
          <DataTable.Content
            isLoading={backupsQuery.isLoading}
            emptyMessage="لا توجد نسخ احتياطية بعد."
            emptyIcon={DatabaseBackup}
          />
          <DataTable.Pagination />
        </DataTable>
      )}

      {/* Restore instructions — there is no in-app restore */}
      <section className="space-y-3 rounded-2xl border border-app-separator bg-app-bg-primary p-5 text-xs text-app-label-primary">
        <h2 className="text-sm font-bold">استعادة نسخة احتياطية</h2>
        <div className="flex items-start gap-2 rounded-xl border border-app-status-orange/30 bg-app-status-orange/10 p-3 font-semibold">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-app-status-orange" />
          الاستعادة تستبدل قاعدة البيانات الحالية بالكامل لكل الوحدات، ولذلك لا تتم من البرنامج بل على الخادم بيد المسؤول
          التقني. كل ما سُجّل بعد وقت النسخة يضيع.
        </div>
        <ol className="space-y-3">
          <RestoreStep n={1}>
            نزّل النسخة المطلوبة من الجدول أعلاه، وتأكد أن بصمة الملف تطابق بصمته المعروضة.
            <Cmd>sha256sum fine-backup-….gz</Cmd>
          </RestoreStep>
          <RestoreStep n={2}>
            انقل الملف إلى الخادم، وأوقف الاستخدام: ضع التطبيق في وضع الصيانة، ثم أوقف عمّال الطوابير والمهام المجدولة و
            PHP-FPM (أو خادم الويب) حتى لا يبقى أي اتصال مفتوح بقاعدة البيانات.
            <Cmd>php artisan down</Cmd>
          </RestoreStep>
          <RestoreStep n={3}>
            خذ نسخة احتياطية من قاعدة البيانات الحالية أولاً (احتياطاً)، ثم فك ضغط الملف.
            <Cmd>gunzip fine-backup-….gz</Cmd>
          </RestoreStep>
          <RestoreStep n={4}>
            <span className="font-semibold">SQLite</span> (ملف ينتهي بـ <span className="font-mono">.sqlite</span>): الملف هو المضبوط في{" "}
            <span className="font-mono">DB_DATABASE</span> (وإن لم يُضبط فهو{" "}
            <span className="font-mono">database/database.sqlite</span>). انقل الملف الحالي جانباً{" "}
            <span className="font-semibold">مع ملفَي <span className="font-mono">-wal</span> و <span className="font-mono">-shm</span>{" "}
            المجاورين له</span> — تركهما بجانب الملف المستعاد يُفسده — ثم ضع الملف المفكوك مكانه بنفس مالك الملف القديم وصلاحياته.
            <Cmd>DB=database/database.sqlite</Cmd>
            <Cmd>mv &quot;$DB&quot; &quot;$DB.old&quot; &amp;&amp; for f in &quot;$DB-wal&quot; &quot;$DB-shm&quot;; do [ -e &quot;$f&quot; ] &amp;&amp; mv &quot;$f&quot; &quot;$f.old&quot;; done</Cmd>
            <Cmd>cp fine-backup-….sqlite &quot;$DB&quot; &amp;&amp; chown --reference=&quot;$DB.old&quot; &quot;$DB&quot; &amp;&amp; chmod --reference=&quot;$DB.old&quot; &quot;$DB&quot;</Cmd>
            <br />
            <span className="font-semibold">PostgreSQL</span> (ملف ينتهي بـ <span className="font-mono">.dump</span>): احذف قاعدة البيانات
            وأنشئها فارغة من جديد ثم استعد الملف إليها — الاستعادة فوق القاعدة القائمة تترك الجداول الأحدث من النسخة فتفشل الترحيلات
            بعدها. خذ الخادم والمستخدم واسم القاعدة من <span className="font-mono">DB_HOST</span> و{" "}
            <span className="font-mono">DB_USERNAME</span> و <span className="font-mono">DB_DATABASE</span> في ملف{" "}
            <span className="font-mono">.env</span>؛ ونفّذ dropdb و createdb بمستخدم يملك صلاحية إنشاء القواعد (مثل postgres) و
            pg_restore بمستخدم التطبيق.
            <Cmd>dropdb -h &lt;DB_HOST&gt; -U postgres --if-exists &lt;DB_DATABASE&gt;</Cmd>
            <Cmd>createdb -h &lt;DB_HOST&gt; -U postgres -O &lt;DB_USERNAME&gt; &lt;DB_DATABASE&gt;</Cmd>
            <Cmd>pg_restore -h &lt;DB_HOST&gt; -U &lt;DB_USERNAME&gt; --no-owner --no-privileges --dbname=&lt;DB_DATABASE&gt; fine-backup-….dump</Cmd>
          </RestoreStep>
          <RestoreStep n={5}>
            طبّق ترحيلات قاعدة البيانات (إن كانت النسخة أقدم من إصدار الخادم) ثم أعد تشغيل PHP-FPM والتطبيق والعمّال.
            <Cmd>php artisan migrate --force &amp;&amp; php artisan up</Cmd>
          </RestoreStep>
        </ol>
      </section>

      {downloaded && <ChecksumDialog file={downloaded} onClose={() => setDownloaded(null)} />}

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="حذف النسخة الاحتياطية"
        message={
          deleting
            ? `سيُحذف ملف النسخة «${deleting.file}» من الخادم نهائياً ولا يمكن تنزيله بعد ذلك. هل تريد المتابعة؟`
            : ""
        }
        confirmText="حذف"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};

export default BackupsPage;
