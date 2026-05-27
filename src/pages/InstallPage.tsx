import { invoke } from "@tauri-apps/api/core";
import { BookOpenText, History } from "lucide-react";
import { InstallerCard } from "../components/InstallerCard";
import { useSetupStore } from "../store/useSetupStore";

async function openExternalLink(url: string) {
  try {
    await invoke("open_external_url", { url });
  } catch (error) {
    if (String(error).toLowerCase().includes("invoke")) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    throw error;
  }
}

export function InstallPage() {
  const systemError = useSetupStore((state) => state.systemError);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <img
            className="h-[76px] w-auto drop-shadow-[0_12px_28px_rgba(36,122,255,0.22)]"
            src="/misty-setup.png"
            alt="Misty logo"
          />
          <span className="flex items-end gap-2 font-sans leading-none">
            <span className="text-5xl font-extrabold tracking-normal text-white">Misty</span>
            <span className="pb-1 text-sm font-semibold text-[#8f99a6]">setup</span>
          </span>
        </div>

        <nav className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-[#b5bac1]">
          <a
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
            href="https://mistysys.com/changelog"
            onClick={(event) => {
              event.preventDefault();
              void openExternalLink("https://mistysys.com/changelog");
            }}
          >
            <History aria-hidden="true" className="h-4 w-4" />
            Changelog
          </a>
          <a
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
            href="https://mistysys.com/docs"
            onClick={(event) => {
              event.preventDefault();
              void openExternalLink("https://mistysys.com/docs");
            }}
          >
            <BookOpenText aria-hidden="true" className="h-4 w-4" />
            Docs
          </a>
        </nav>
      </header>

      <section className="flex min-h-0 flex-1 flex-col justify-center py-5">
        <InstallerCard />

        {systemError && (
          <p className="mt-3 max-w-md rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
            {systemError}
          </p>
        )}
      </section>
    </div>
  );
}
