# Misty Hub

Tauri + React + TypeScript + Tailwind hub shell for Misty.

## Scaffold

Run:

```sh
./scripts/scaffold-basic-app.sh
```

Or ask Codex to follow:

```text
.codex/scripts/scaffold-basic-app.md
```

The scaffold creates a Tauri v2 app, installs Tailwind, and drops in starter Rust commands for:

- fetching a release manifest
- downloading private artifacts through an auth-aware downloader boundary
- checksum verification placeholders
- streaming install progress back to the React UI later

## Secret Handling Note

Do not ship a permanent GitHub token inside the installer. Even if it is encrypted, the app also needs the decryption path, so a determined user can extract it.

Recommended production shape:

1. Installer calls your own small download broker.
2. Broker authenticates/authorizes the installer or user.
3. Broker returns short-lived signed URLs or streams artifacts.
4. Installer verifies SHA256/signature from a signed manifest before installing.

For a private/internal first pass, the scaffold leaves a `MISTY_DOWNLOAD_TOKEN` development path, but it is intentionally not wired as a production credential strategy.

## Release Manifest

Misty Hub currently fetches a JSON manifest for the selected release.

Expected shape:

```json
{
  "version": "v0.1.0",
  "artifacts": [
    {
      "name": "misty-0.1.0-macos-aarch64.zip",
      "platform": "macos-aarch64",
      "url": "https://github.com/misty-org/misty/releases/download/v0.1.0/misty-0.1.0-macos-aarch64.zip",
      "sha256": "replace-with-real-sha256"
    }
  ]
}
```

`platform` must match Rust's `std::env::consts::OS` and `std::env::consts::ARCH` joined with a dash, such as `macos-aarch64`, `macos-x86_64`, `windows-x86_64`, or `linux-x86_64`.

Misty Hub initializes `~/.misty`, creates `~/.misty/db/data.db`, and downloads matching `.zip` artifacts into `~/.misty/.local/bin`. Installs are blocked until the local database has an authenticated Misty user.

For production, point each `url` at a short-lived signed URL or your download broker, then verify `sha256` before installing.
