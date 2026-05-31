#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Misty Hub"

cd "$ROOT_DIR"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd npm
need_cmd node
need_cmd cargo

if [[ -f package.json && "${1:-}" != "--force" ]]; then
  echo "package.json already exists."
  echo "Re-run with --force if you intentionally want to refresh scaffold-managed files."
else
  if [[ ! -f package.json ]]; then
    tmp_app="$ROOT_DIR/.vite-scaffold"
    rm -rf "$tmp_app"
    npm create vite@latest "$tmp_app" -- --template react-ts
    cp "$tmp_app/package.json" "$ROOT_DIR/package.json"
    cp "$tmp_app/index.html" "$ROOT_DIR/index.html"
    cp "$tmp_app/tsconfig.json" "$ROOT_DIR/tsconfig.json"
    cp "$tmp_app/tsconfig.app.json" "$ROOT_DIR/tsconfig.app.json"
    cp "$tmp_app/tsconfig.node.json" "$ROOT_DIR/tsconfig.node.json"
    cp "$tmp_app/vite.config.ts" "$ROOT_DIR/vite.config.ts"
    cp "$tmp_app/eslint.config.js" "$ROOT_DIR/eslint.config.js"
    cp -R "$tmp_app/public" "$ROOT_DIR/public"
    cp -R "$tmp_app/src" "$ROOT_DIR/src"
    if [[ ! -f .gitignore ]]; then
      cp "$tmp_app/.gitignore" "$ROOT_DIR/.gitignore"
    fi
    rm -rf "$tmp_app"
  fi
fi

npm install
npm install @tauri-apps/api
npm install -D @tauri-apps/cli tailwindcss @tailwindcss/vite

if [[ ! -d src-tauri ]]; then
  npx tauri init \
    --app-name "$APP_NAME" \
    --window-title "Misty Hub" \
    --frontend-dist "../dist" \
    --dev-url "http://localhost:1420" \
    --before-dev-command "npm run dev -- --host 127.0.0.1 --port 1420" \
    --before-build-command "npm run build"
fi

mkdir -p src src-tauri/src src-tauri/capabilities
rm -rf src/assets src/index.css

cat > vite.config.ts <<'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
EOF

cat > .env.example <<'EOF'
# Development only. Do not ship a static GitHub/repo token in production builds.
MISTY_MANIFEST_URL=https://example.com/misty/manifest.json
MISTY_DOWNLOAD_TOKEN=
EOF

cat > src/App.tsx <<'EOF'
import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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

export default function App() {
  const [status, setStatus] = useState<InstallerStatus | null>(null);
  const [events, setEvents] = useState<InstallEvent[]>([]);
  const [manifestUrl, setManifestUrl] = useState(
    import.meta.env.VITE_MISTY_MANIFEST_URL ?? "https://example.com/misty/manifest.json",
  );
  const [busy, setBusy] = useState(false);

  const canInstall = useMemo(() => manifestUrl.trim().length > 0 && !busy, [busy, manifestUrl]);

  async function checkSystem() {
    setBusy(true);
    try {
      const nextStatus = await invoke<InstallerStatus>("check_system");
      setStatus(nextStatus);
      setEvents((prev) => [...prev, { level: "info", message: "System check complete." }]);
    } catch (error) {
      setEvents((prev) => [...prev, { level: "error", message: String(error) }]);
    } finally {
      setBusy(false);
    }
  }

  async function startInstall() {
    setBusy(true);
    setEvents([{ level: "info", message: "Starting Misty install." }]);
    try {
      const result = await invoke<string>("install_misty", { manifestUrl });
      setEvents((prev) => [...prev, { level: "info", message: result }]);
    } catch (error) {
      setEvents((prev) => [...prev, { level: "error", message: String(error) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-6 py-10">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">Misty</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal text-white">Installer</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
            Install the Misty client, backend proxy, and supporting assets from a verified release manifest.
          </p>
        </div>

        <div className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-900/70 p-5 shadow-2xl shadow-black/30">
          <label className="grid gap-2 text-sm font-medium text-zinc-200">
            Manifest URL
            <input
              className="h-11 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 outline-none transition focus:border-cyan-300"
              value={manifestUrl}
              onChange={(event) => setManifestUrl(event.target.value)}
              spellCheck={false}
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              className="h-10 rounded-md bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy}
              onClick={checkSystem}
            >
              Check System
            </button>
            <button
              className="h-10 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canInstall}
              onClick={startInstall}
            >
              Install Misty
            </button>
          </div>
        </div>

        {status && (
          <dl className="mt-5 grid gap-3 rounded-lg border border-zinc-800 p-5 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-zinc-500">OS</dt>
              <dd className="mt-1 text-zinc-100">{status.os}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Arch</dt>
              <dd className="mt-1 text-zinc-100">{status.arch}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Install Dir</dt>
              <dd className="mt-1 truncate text-zinc-100">{status.install_dir}</dd>
            </div>
          </dl>
        )}

        <div className="mt-5 min-h-44 rounded-lg border border-zinc-800 bg-black p-4 font-mono text-sm">
          {events.length === 0 ? (
            <p className="text-zinc-500">Installer output will appear here.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((event, index) => (
                <li
                  className={
                    event.level === "error"
                      ? "text-red-300"
                      : event.level === "warn"
                        ? "text-amber-300"
                        : "text-zinc-300"
                  }
                  key={`${event.level}-${index}`}
                >
                  [{event.level}] {event.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
EOF

cat > src/App.css <<'EOF'
@import "tailwindcss";

:root {
  color-scheme: dark;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}
EOF

cat > src/main.tsx <<'EOF'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
EOF

cat > src-tauri/src/main.rs <<'EOF'
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
struct InstallerStatus {
    os: String,
    arch: String,
    install_dir: String,
}

#[derive(Debug, Deserialize)]
struct ReleaseManifest {
    version: String,
    #[serde(alias = "assets", default)]
    artifacts: Vec<ReleaseArtifact>,
}

#[derive(Debug, Deserialize)]
struct ReleaseArtifact {
    name: String,
    platform: String,
    url: String,
    sha256: String,
}

#[tauri::command]
fn check_system() -> Result<InstallerStatus, String> {
    let install_dir = dirs::home_dir()
        .map(|home| home.join(".misty").display().to_string())
        .ok_or_else(|| "Could not resolve home directory".to_string())?;

    Ok(InstallerStatus {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        install_dir,
    })
}

#[tauri::command]
async fn install_misty(manifest_url: String) -> Result<String, String> {
    let manifest = fetch_manifest(&manifest_url).await?;
    let platform = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    let matching_artifacts: Vec<_> = manifest
        .artifacts
        .iter()
        .filter(|artifact| artifact.platform == platform)
        .collect();

    if matching_artifacts.is_empty() {
        return Err(format!("No Misty artifacts found for platform {platform}"));
    }

    for artifact in matching_artifacts {
        // TODO: Download to a temp file, verify SHA256, then atomically install.
        // Keep the downloader isolated so private auth can move from dev token to broker URLs.
        let _ = (&artifact.name, &artifact.url, &artifact.sha256);
    }

    Ok(format!("Prepared Misty {} for {platform}. Download/install steps are scaffolded next.", manifest.version))
}

async fn fetch_manifest(manifest_url: &str) -> Result<ReleaseManifest, String> {
    let client = reqwest::Client::new();
    let mut request = client.get(manifest_url);

    if let Ok(token) = std::env::var("MISTY_DOWNLOAD_TOKEN") {
        if !token.trim().is_empty() {
            request = request.bearer_auth(token);
        }
    }

    request
        .send()
        .await
        .map_err(|error| format!("Could not fetch manifest: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Manifest request failed: {error}"))?
        .json::<ReleaseManifest>()
        .await
        .map_err(|error| format!("Manifest JSON was invalid: {error}"))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![check_system, install_misty])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
EOF

if [[ -f src-tauri/Cargo.toml ]]; then
  cargo add --manifest-path src-tauri/Cargo.toml serde --features derive || true
  cargo add --manifest-path src-tauri/Cargo.toml reqwest --features json,rustls || true
  cargo add --manifest-path src-tauri/Cargo.toml dirs || true
fi

node - <<'NODE'
const fs = require("fs");
const path = "package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
pkg.name = "misty-hub";
pkg.scripts = {
  ...pkg.scripts,
  dev: "vite --host 127.0.0.1 --port 1420",
  build: "tsc && vite build",
  tauri: "tauri",
};
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
NODE

echo
echo "Scaffold complete."
echo "Next:"
echo "  npm run tauri dev"
echo
