export type CurrentUser = {
  id: string;
  name: string;
  email: string;
};

export type InstallerStatus = {
  os: string;
  arch: string;
  misty_home: string;
  install_dir: string;
  legacy_install_dir: string;
  db_path: string;
  current_user: CurrentUser | null;
  ready: boolean;
  folders: InstallCheck[];
  binaries: InstallCheck[];
  setup_update: InstallCheck;
};

export type CheckStatus = "ready" | "missing" | "pending" | "info";

export type InstallCheck = {
  name: string;
  path: string;
  required: boolean;
  exists: boolean;
  status: CheckStatus;
  message: string;
};

export type NativeSystemInfo = {
  os: string;
  arch: string;
  misty_home: string;
  install_dir: string;
  legacy_install_dir: string;
  db_path: string;
  setup_path: string;
  current_user: CurrentUser | null;
};

export type PathProbe = {
  path: string;
  exists: boolean;
  is_dir: boolean;
  is_file: boolean;
};

export type InstallEvent = {
  level: "info" | "warn" | "error";
  message: string;
};

export type InstallState = "idle" | "installing" | "success" | "error";

export type ReleaseVersion = {
  version: string;
  date: string;
  summary: string;
  manifestUrl: string;
  changes: string[];
};
