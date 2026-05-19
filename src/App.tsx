import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleDot,
  ExternalLink,
  Terminal,
  X,
} from "lucide-react";
import "./App.css";

type InstallerStatus = {
  os: string;
  arch: string;
  install_dir: string;
};

type InstallEvent = {
  level: "info" | "warn" | "error";
  message: string;
};

type InstallState = "idle" | "installing" | "success" | "error";

type ReleaseVersion = {
  version: string;
  date: string;
  summary: string;
  manifestUrl: string;
  changes: string[];
};

const minLogHeight = 132;
const defaultLogHeight = 150;
const maxLogHeight = 360;

const releases: ReleaseVersion[] = [
  {
    version: "v0.3.0",
    date: "March 2026",
    summary: "Linux support and drag-and-drop transfers",
    manifestUrl: "https://example.com/misty/v0.3.0/manifest.json",
    changes: [
      "Linux support for x86_64 and ARM64",
      "New drag-and-drop transfer interface",
      "Improved connection stability for Google Drive and OneDrive",
      "Dark mode refinements and accessibility improvements",
    ],
  },
  {
    version: "v0.2.1",
    date: "February 2026",
    summary: "Stability and progress reporting",
    manifestUrl: "https://example.com/misty/v0.2.1/manifest.json",
    changes: [
      "Fixed crash when reconnecting expired OAuth sessions",
      "Improved file upload progress reporting",
      "Minor UI polish and animation fixes",
    ],
  },
  {
    version: "v0.2.0",
    date: "January 2026",
    summary: "Multi-account and clipboard",
    manifestUrl: "https://example.com/misty/v0.2.0/manifest.json",
    changes: [
      "Multi-account support for all providers",
      "Misty clipboard for cross-provider file operations",
      "Batch rename and bulk actions",
      "Performance improvements for large directories",
    ],
  },
  {
    version: "v0.1.0",
    date: "December 2025",
    summary: "Initial release",
    manifestUrl: "https://example.com/misty/v0.1.0/manifest.json",
    changes: [
      "ImGui-based desktop client with local file browsing",
      "Go backend proxy with gRPC communication",
      "Basic file operations: copy, move, delete",
      "Cross-platform builds for Windows and macOS",
    ],
  },
];

function formatPlatform(status: InstallerStatus | null) {
  if (!status) {
    return "Resolving";
  }

  return `${status.os}-${status.arch}`;
}

function browserSystemFallback(): InstallerStatus {
  const platform = navigator.platform || "desktop";
  const os = platform.toLowerCase().includes("mac")
    ? "macos"
    : platform.toLowerCase().includes("win")
      ? "windows"
      : platform.toLowerCase().includes("linux")
        ? "linux"
        : "desktop";

  return {
    os,
    arch: platform.toLowerCase().includes("arm") ? "arm64" : "x86_64",
    install_dir: "Resolved by the desktop installer",
  };
}

export default function App() {
  const [status, setStatus] = useState<InstallerStatus | null>(null);
  const [systemError, setSystemError] = useState("");
  const [events, setEvents] = useState<InstallEvent[]>([]);
  const [selectedVersion, setSelectedVersion] = useState(releases[0].version);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [detailRelease, setDetailRelease] = useState<ReleaseVersion | null>(null);
  const [logHeight, setLogHeight] = useState(defaultLogHeight);
  const [installState, setInstallState] = useState<InstallState>("idle");
  const [busy, setBusy] = useState(false);
  const dragStartRef = useRef<{ y: number; height: number } | null>(null);
  const versionMenuRef = useRef<HTMLDivElement | null>(null);

  const selectedRelease = useMemo(
    () => releases.find((release) => release.version === selectedVersion) ?? releases[0],
    [selectedVersion],
  );
  const osName = status?.os ?? (systemError ? "Unavailable" : "Resolving");
  const installLocation = status?.install_dir ?? (systemError ? "Unavailable" : "Resolving location");
  const binaryType = status?.arch ?? (systemError ? "Unavailable" : "Resolving");
  const latestVersion = releases[0].version;
  const progressClass =
    installState === "installing"
      ? "animate-progress bg-[#f4f4f5]"
      : installState === "success"
        ? "w-full bg-emerald-300"
        : installState === "error"
          ? "w-0 bg-red-300"
          : "w-0 bg-[#f4f4f5]";

  function eventIcon(level?: InstallEvent["level"]) {
    if (level === "error") {
      return <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-red-300" />;
    }

    if (level === "warn") {
      return <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-300" />;
    }

    if (level === "info") {
      return <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-[#dbdee1]" />;
    }

    return <CircleDot aria-hidden="true" className="h-4 w-4 shrink-0 text-[#949ba4]" />;
  }

  function startLogDrag(event: PointerEvent<HTMLButtonElement>) {
    dragStartRef.current = { y: event.clientY, height: logHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragLog(event: PointerEvent<HTMLButtonElement>) {
    if (!dragStartRef.current) {
      return;
    }

    const delta = dragStartRef.current.y - event.clientY;
    const nextHeight = Math.min(
      maxLogHeight,
      Math.max(minLogHeight, dragStartRef.current.height + delta),
    );
    setLogHeight(nextHeight);
  }

  function endLogDrag() {
    if (!dragStartRef.current) {
      return;
    }

    dragStartRef.current = null;
  }

  function selectRelease(version: string) {
    setSelectedVersion(version);
    setVersionMenuOpen(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSystem() {
      try {
        const nextStatus = await invoke<InstallerStatus>("check_system");
        if (!cancelled) {
          setStatus(nextStatus);
        }
      } catch (error) {
        if (!cancelled) {
          if (String(error).toLowerCase().includes("invoke")) {
            setStatus(browserSystemFallback());
            return;
          }

          setSystemError(String(error));
        }
      }
    }

    void loadSystem();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!versionMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!versionMenuRef.current?.contains(event.target as Node)) {
        setVersionMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setVersionMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [versionMenuOpen]);

  useEffect(() => {
    if (!detailRelease) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDetailRelease(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [detailRelease]);

  async function startInstall() {
    setBusy(true);
    setInstallState("installing");
    setEvents([
      {
        level: "info",
        message: `Preparing Misty ${selectedRelease.version}.`,
      },
    ]);

    try {
      const result = await invoke<string>("install_misty", {
        manifestUrl: selectedRelease.manifestUrl,
        version: selectedRelease.version,
      });
      setInstallState("success");
      setEvents((prev) => [...prev, { level: "info", message: result }]);
    } catch (error) {
      setInstallState("error");
      setEvents((prev) => [...prev, { level: "error", message: String(error) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="h-screen overflow-hidden bg-[#07090b] text-white">
      <section className="relative mx-auto flex h-screen w-full max-w-[560px] flex-col px-6 pb-4 pt-6">
        <header className="flex shrink-0 flex-col items-center text-center">
          <div>
            <img
              className={`h-28 w-auto ${busy ? "animate-misty-pulse" : ""}`}
              src="/misty-full.png"
              alt="Misty logo"
            />
          </div>
          <p className="mt-2 text-sm font-medium text-[#b5bac1]">
            {installState === "installing"
              ? "Installing update..."
              : installState === "success"
                ? "Install ready"
                : installState === "error"
                  ? "Install failed"
                  : "Ready to install"}
          </p>

          <div className="mt-5 w-full rounded-xl border border-[#1e1e21] bg-[#0b0d0f] shadow-xl shadow-black/20">
            <div className="flex items-center gap-3 border-b border-[#1e1e21] p-3">
              <div className="relative min-w-0 flex-1" ref={versionMenuRef}>
                <button
                  aria-expanded={versionMenuOpen}
                  aria-haspopup="listbox"
                  className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-[#27272a] bg-[#07090b] px-3 text-left text-sm font-semibold text-white outline-none transition hover:border-[#3f3f46] focus:border-[#d4d4d8] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busy}
                  onClick={() => setVersionMenuOpen((open) => !open)}
                  type="button"
                >
                  <span className="min-w-0 truncate">
                    {selectedRelease.version}
                    {selectedRelease.version === latestVersion && <span className="text-[#a1a1aa]"> (latest)</span>}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 text-[#a1a1aa] transition-transform ${versionMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {versionMenuOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-lg border border-[#27272a] bg-[#050607] p-1 shadow-2xl shadow-black/50">
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
                            onClick={() => selectRelease(release.version)}
                            role="option"
                            type="button"
                          >
                            <span className="min-w-0">
                              <span className="block font-mono text-sm font-semibold">{release.version}</span>
                              <span className={selected ? "block truncate text-xs text-[#3f3f46]" : "block truncate text-xs text-[#949ba4]"}>
                                {release.date}
                              </span>
                            </span>
                            <span className={selected ? "shrink-0 text-xs font-bold uppercase tracking-wide text-[#27272a]" : "shrink-0 text-xs text-[#71717a]"}>
                              {release.version === latestVersion ? "(latest)" : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <button
                className="h-11 shrink-0 rounded-lg bg-[#f4f4f5] px-5 text-sm font-bold text-[#07090b] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy}
                onClick={startInstall}
              >
                {busy ? "Installing" : "Install"}
              </button>
            </div>

            <div className="px-3 pb-3 pt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-[#18181b]">
                <div className={`h-full rounded-full transition-all duration-300 ${progressClass}`} />
              </div>

              <div className="mt-3 flex min-w-0 items-center gap-2 rounded-lg border border-[#1e1e21] bg-[#07090b] px-3 py-3 font-mono text-xs text-[#d4d4d8]">
                <span className="shrink-0">{osName}</span>
                <span className="min-w-0 flex-1 truncate text-center">{installLocation}</span>
                <span className="shrink-0">{binaryType}</span>
              </div>
            </div>
          </div>

          {systemError && (
            <p className="mt-3 max-w-md rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
              {systemError}
            </p>
          )}
        </header>

        <section
          className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[#1e1e21] bg-[#0b0d0f] shadow-2xl shadow-black/25"
          style={{ marginBottom: logHeight + 16 }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[#27272a] px-4 py-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#949ba4]">Changelog</p>
              <h2 className="mt-1 text-base font-bold text-white">Release notes</h2>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="grid gap-2">
              {releases.map((release) => (
                <article
                  className="flex items-center justify-between gap-3 rounded-md border border-[#27272a] bg-[#07090b] px-3 py-3"
                  key={release.version}
                >
                  <div className="min-w-0 text-left">
                    <span className="block font-mono text-sm font-semibold text-[#f2f3f5]">{release.version}</span>
                    <span className="mt-1 block truncate text-xs text-[#b5bac1]">{release.summary}</span>
                  </div>
                  <button
                    aria-label={`Open ${release.version} changelog`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#27272a] text-[#949ba4] transition hover:border-[#3f3f46] hover:bg-[#18181b] hover:text-white"
                    onClick={() => setDetailRelease(release)}
                    type="button"
                  >
                    <ExternalLink aria-hidden="true" className="h-4 w-4" />
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        {detailRelease && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 px-5 py-6">
            <button
              aria-label="Close changelog"
              className="absolute inset-0 cursor-default"
              onClick={() => setDetailRelease(null)}
              type="button"
            />

            <section
              aria-modal="true"
              className="relative z-10 flex max-h-[calc(100vh-48px)] w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-[#27272a] bg-[#0b0d0f] shadow-2xl shadow-black/60"
              role="dialog"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-[#27272a] px-5 py-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#949ba4]">Changelog</p>
                  <h2 className="mt-1 font-mono text-lg font-bold text-white">{detailRelease.version}</h2>
                  <p className="mt-1 text-sm text-[#b5bac1]">{detailRelease.summary}</p>
                </div>
                <button
                  aria-label="Close changelog"
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[#27272a] text-[#949ba4] transition hover:border-[#3f3f46] hover:text-white"
                  onClick={() => setDetailRelease(null)}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="rounded-md border border-[#27272a] bg-[#07090b] p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-[#949ba4]">{detailRelease.date}</span>
                    {detailRelease.version === latestVersion && (
                      <span className="rounded bg-[#f4f4f5] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#07090b]">
                        Latest
                      </span>
                    )}
                  </div>
                  <ul className="grid gap-3">
                    {detailRelease.changes.map((change) => (
                      <li className="flex gap-3 text-sm leading-6 text-[#dbdee1]" key={change}>
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d4d4d8]" />
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        )}

        <footer
          className="absolute inset-x-6 bottom-4 mx-auto flex max-w-[512px] flex-col overflow-hidden rounded-lg border border-[#1e1e21] bg-[#050607] font-mono text-xs text-[#949ba4] shadow-2xl shadow-black/40"
          style={{ height: logHeight }}
        >
          <button
            aria-label="Resize logger"
            className="flex h-7 shrink-0 touch-none items-center justify-center border-b border-[#1e1e21] text-[#71717a] transition hover:text-[#d4d4d8]"
            onPointerCancel={endLogDrag}
            onPointerDown={startLogDrag}
            onPointerMove={dragLog}
            onPointerUp={endLogDrag}
            type="button"
          >
            <span className="h-0.5 w-8 rounded-full bg-current" />
          </button>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-8 shrink-0 items-center justify-between gap-3 px-4">
              <span className="flex items-center gap-2 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-[#949ba4]">
                <Terminal aria-hidden="true" className="h-3.5 w-3.5" />
                Log
              </span>
              <span className="font-mono text-[11px] text-[#71717a]">{events.length} events</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
              {events.length === 0 ? (
                <div className="flex items-center gap-2 text-[#949ba4]">
                  {eventIcon()}
                  <span>Waiting for install.</span>
                </div>
              ) : (
                <ul className="grid gap-2">
                  {events.map((event, index) => (
                    <li
                      className={
                        event.level === "error"
                          ? "flex gap-2 text-red-300"
                          : event.level === "warn"
                            ? "flex gap-2 text-amber-300"
                            : "flex gap-2 text-[#dbdee1]"
                      }
                      key={`${event.level}-${index}`}
                    >
                      {eventIcon(event.level)}
                      <span className="min-w-0 break-words">[{event.level}] {event.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}
