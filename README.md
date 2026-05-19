# Misty Setup

Tauri + React + TypeScript + Tailwind setup shell for Misty.

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

Misty Setup currently fetches a JSON manifest for the selected release. See [docs/release-manifest.example.json](/Users/mtccool668/projects/misty-installer/docs/release-manifest.example.json).

Expected shape:

```json
{
  "version": "v0.3.0",
  "assets": [
    {
      "name": "misty-v0.3.0-macos-aarch64.tar.gz",
      "platform": "macos-aarch64",
      "url": "https://downloads.example.com/misty/v0.3.0/macos-aarch64.tar.gz",
      "sha256": "replace-with-real-sha256"
    }
  ]
}
```

`platform` must match Rust's `std::env::consts::OS` and `std::env::consts::ARCH` joined with a dash, such as `macos-aarch64`, `macos-x86_64`, `windows-x86_64`, or `linux-x86_64`.

For production, point each `url` at a short-lived signed URL or your download broker, then verify `sha256` before installing.
