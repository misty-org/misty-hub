import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { buildInstallerStatus, mistyPath, requiredMistyBinaries, requiredMistyFolders } from "../data/installReadiness";
import { releases } from "../data/releases";
import type {
  CurrentUser,
  InstallEvent,
  InstallerStatus,
  InstallState,
  NativeSystemInfo,
  PathProbe,
  ReleaseVersion,
} from "../types/setup";

type SetupStore = {
  busy: boolean;
  events: InstallEvent[];
  installState: InstallState;
  selectedVersion: string;
  status: InstallerStatus | null;
  systemError: string;
  selectedRelease: () => ReleaseVersion;
  addEvent: (event: InstallEvent) => void;
  loadSystem: () => Promise<void>;
  restartMisty: () => Promise<void>;
  saveAuthenticatedUser: (user: CurrentUser) => Promise<void>;
  setSelectedVersion: (version: string) => void;
  launchMisty: () => Promise<void>;
  signOut: () => Promise<void>;
  startInstall: () => Promise<void>;
};

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
    misty_home: "~/.misty",
    install_dir: "~/.misty/.local/bin",
    legacy_install_dir: "~/.misty/local/bin",
    db_path: "~/.misty/db/data.db",
    current_user: null,
    ready: false,
    folders: requiredMistyFolders.map((folder) => ({
      name: folder,
      path: `~/.misty/${folder}`,
      required: true,
      exists: false,
      status: "missing",
      message: "Folder readiness is only verified in the desktop app.",
    })),
    binaries: [
      {
        name: "misty",
        path: "~/.misty/.local/bin/misty",
        required: true,
        exists: false,
        status: "missing",
        message: "Binary will be installed from a release archive.",
      },
      {
        name: "misty-proxy",
        path: "~/.misty/.local/bin/misty-proxy",
        required: true,
        exists: false,
        status: "missing",
        message: "Binary will be installed from a release archive.",
      },
    ],
    setup_update: {
      name: "Misty Hub",
      path: "browser preview",
      required: false,
      exists: true,
      status: "pending",
      message: "Hub update check is only available in the desktop app.",
    },
  };
}

async function loadInstallerStatus(nativeOverride?: NativeSystemInfo) {
  const native = nativeOverride ?? (await invoke<NativeSystemInfo>("check_system"));
  const folderProbes = await invoke<PathProbe[]>("ensure_misty_folders", {
    folders: requiredMistyFolders,
  });
  const binaryProbes = await invoke<PathProbe[]>("probe_paths", {
    paths: requiredMistyBinaries.map((binary) => mistyPath(native.install_dir, binary)),
  });
  const [setupProbe] = await invoke<PathProbe[]>("probe_paths", {
    paths: [native.setup_path],
  });

  return buildInstallerStatus(native, folderProbes, binaryProbes, setupProbe);
}

export const useSetupStore = create<SetupStore>((set, get) => ({
  busy: false,
  events: [],
  installState: "idle",
  selectedVersion: releases[0].version,
  status: null,
  systemError: "",
  selectedRelease: () =>
    releases.find((release) => release.version === get().selectedVersion) ?? releases[0],
  addEvent: (event) => set((state) => ({ events: [...state.events, event] })),
  loadSystem: async () => {
    try {
      const status = await loadInstallerStatus();
      set({ status, systemError: "" });
    } catch (error) {
      if (String(error).toLowerCase().includes("invoke")) {
        set({ status: browserSystemFallback(), systemError: "" });
        return;
      }

      set({ systemError: String(error) });
    }
  },
  saveAuthenticatedUser: async (user) => {
    const native = await invoke<NativeSystemInfo>("save_authenticated_user", { user });
    const status = await loadInstallerStatus(native);
      set((state) => ({
        status,
        systemError: "",
        events: [...state.events, { level: "info", source: "installer", message: `Signed in as ${user.email}.` }],
      }));
  },
  setSelectedVersion: (selectedVersion) => set({ selectedVersion }),
  launchMisty: async () => {
    try {
      const result = await invoke<string>("launch_misty");
      set((state) => ({
        events: [...state.events, { level: "info", source: "launcher", message: result }],
      }));
    } catch (error) {
      set((state) => ({
        events: [...state.events, { level: "error", source: "launcher", message: String(error) }],
      }));
    }
  },
  restartMisty: async () => {
    try {
      const result = await invoke<string>("restart_misty");
      set((state) => ({
        events: [...state.events, { level: "info", source: "launcher", message: result }],
      }));
    } catch (error) {
      set((state) => ({
        events: [...state.events, { level: "error", source: "launcher", message: String(error) }],
      }));
    }
  },
  signOut: async () => {
    try {
      const native = await invoke<NativeSystemInfo>("sign_out_misty");
      const status = await loadInstallerStatus(native);
      set((state) => ({
        status,
        events: [...state.events, { level: "info", source: "installer", message: "Signed out of Misty." }],
      }));
    } catch (error) {
      set((state) => ({
        events: [...state.events, { level: "error", source: "installer", message: String(error) }],
      }));
    }
  },
  startInstall: async () => {
    const { status, selectedRelease } = get();
    const release = selectedRelease();

    if (!status?.current_user) {
      set({
        installState: "error",
        events: [{ level: "error", source: "installer", message: "Sign in to Misty before installing." }],
      });
      return;
    }

    set({
      busy: true,
      installState: "installing",
      events: [{ level: "info", source: "installer", message: `Preparing Misty ${release.version}.` }],
    });

    try {
      const result = await invoke<string>("install_misty", {
        manifestUrl: release.manifestUrl,
        version: release.version,
      });
      const status = await loadInstallerStatus();
      set((state) => ({
        busy: false,
        installState: "success",
        status,
        events: [...state.events, { level: "info", source: "installer", message: result }],
      }));
    } catch (error) {
      set((state) => ({
        busy: false,
        installState: "error",
        events: [...state.events, { level: "error", source: "installer", message: String(error) }],
      }));
    }
  },
}));
