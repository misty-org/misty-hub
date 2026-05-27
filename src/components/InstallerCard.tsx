import { CheckCircle2, CircleAlert, Download } from "lucide-react";
import { VersionPicker } from "./VersionPicker";
import { useSetupStore } from "../store/useSetupStore";
import type { InstallCheck } from "../types/setup";

function countReady(checks: InstallCheck[]) {
  return checks.filter((check) => check.exists).length;
}

function CheckRow({ check }: { check: InstallCheck }) {
  return (
    <div className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 px-8 py-2.5">
      <CircleAlert aria-hidden="true" className="text-amber-300" size={16} />
      <span className="min-w-0 truncate text-[#f4f4f5]" title={check.path}>
        {check.name}
      </span>
      <span className="min-w-0 max-w-[148px] truncate text-right text-[11px] font-medium text-[#9aa3af]">
        {check.exists ? "Ready" : check.required ? "Missing" : "Pending"}
      </span>
    </div>
  );
}

export function InstallerCard() {
  const busy = useSetupStore((state) => state.busy);
  const startInstall = useSetupStore((state) => state.startInstall);
  const status = useSetupStore((state) => state.status);
  const systemError = useSetupStore((state) => state.systemError);
  const canInstall = !busy && Boolean(status?.current_user);
  const osName = status?.os ?? (systemError ? "Unavailable" : "Resolving");
  const binaryType = status?.arch ?? (systemError ? "Unavailable" : "Resolving");
  const folderChecks = status?.folders ?? [];
  const binaryChecks = status?.binaries ?? [];
  const foldersReady = countReady(folderChecks);
  const binariesReady = countReady(binaryChecks);
  const missingChecks = [...folderChecks, ...binaryChecks].filter((check) => check.required && !check.exists);
  const allFound = folderChecks.length > 0 && binaryChecks.length > 0 && missingChecks.length === 0;

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0a0d10]/95 shadow-2xl shadow-black/25">
      <div className="border-b border-white/[0.08] px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.22em] text-[#71717a]">
        version
      </div>

      <div className="flex items-center gap-3 border-b border-white/[0.08] p-2.5">
        <VersionPicker />
        <button
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-[#f4f4f5] px-4 text-sm font-bold text-[#07090b] shadow-lg shadow-white/5 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canInstall}
          onClick={startInstall}
          type="button"
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          {busy ? "Installing" : "Install"}
        </button>
      </div>

      <div className="border-b border-white/[0.08] px-8 py-5">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="min-w-0 text-left">
            <p className="text-base font-medium text-[#f4f4f5]">{osName} {binaryType}</p>
            <p className="mt-1 text-sm text-[#8f8f8f]">
              {foldersReady}/{folderChecks.length || 0} folders · {binariesReady}/{binaryChecks.length || 0} binaries
            </p>
          </div>
        </div>
      </div>

      <div className={allFound ? "px-8 py-3 text-emerald-200" : "py-1.5 text-xs"}>
        {allFound ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 aria-hidden="true" size={16} />
            <span>All required files are present.</span>
          </div>
        ) : missingChecks.length > 0 ? (
          missingChecks.map((check) => <CheckRow check={check} key={check.path} />)
        ) : (
          <div className="px-8 py-2 text-[#9aa3af]">Resolving install readiness.</div>
        )}
      </div>
    </div>
  );
}
