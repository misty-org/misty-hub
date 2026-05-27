import { useEffect, useRef, useState } from "react";
import { ChevronDown, Layers3 } from "lucide-react";
import { releases } from "../data/releases";
import { useSetupStore } from "../store/useSetupStore";

export function VersionPicker() {
  const busy = useSetupStore((state) => state.busy);
  const selectedVersion = useSetupStore((state) => state.selectedVersion);
  const selectedRelease = useSetupStore((state) => state.selectedRelease());
  const setSelectedVersion = useSetupStore((state) => state.setSelectedVersion);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const latestVersion = releases[0].version;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative min-w-0 flex-1" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-10 w-full items-center justify-between gap-3 rounded-md border border-white/10 bg-[#080b0e] px-3.5 text-left text-sm font-semibold text-white outline-none transition hover:border-white/20 hover:bg-[#0b1014] focus:border-[#7dd3fc] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[#7dd3fc]">
            <Layers3 aria-hidden="true" className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate">{selectedRelease.version}</span>
            <span className="block truncate text-[11px] font-medium text-[#8f99a6]">
              {selectedRelease.version === latestVersion ? "Latest release" : selectedRelease.date}
            </span>
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-[#a1a1aa] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-lg border border-white/10 bg-[#050607] p-1 shadow-2xl shadow-black/50">
          <div className="grid gap-1" role="listbox" aria-label="Version">
            {releases.map((release) => {
              const selected = release.version === selectedVersion;

              return (
                <button
                  aria-selected={selected}
                  className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition ${
                    selected
                      ? "bg-[#f4f4f5] text-[#07090b]"
                      : "text-[#d4d4d8] hover:bg-[#18181b] hover:text-white"
                  }`}
                  key={release.version}
                  onClick={() => {
                    setSelectedVersion(release.version);
                    setOpen(false);
                  }}
                  role="option"
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{release.version}</span>
                    <span className={selected ? "block truncate text-xs text-[#3f3f46]" : "block truncate text-xs text-[#949ba4]"}>
                      {release.date}
                    </span>
                  </span>
                  <span className={selected ? "shrink-0 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-[#27272a]" : "shrink-0 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-[#71717a]"}>
                    {release.version === latestVersion ? "Latest" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
