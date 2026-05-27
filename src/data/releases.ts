import type { ReleaseVersion } from "../types/setup";

const githubManifestUrl =
  "https://github.com/misty-org/misty-setup/releases/download/v0.1.0/manifest.json";

export const releases: ReleaseVersion[] = [
  {
    version: "v0.3.0",
    date: "March 2026",
    summary: "Linux support and drag-and-drop transfers",
    manifestUrl: githubManifestUrl,
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
    manifestUrl: githubManifestUrl,
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
    manifestUrl: githubManifestUrl,
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
    manifestUrl: githubManifestUrl,
    changes: [
      "ImGui-based desktop client with local file browsing",
      "Go backend proxy with gRPC communication",
      "Basic file operations: copy, move, delete",
      "Cross-platform builds for Windows and macOS",
    ],
  },
];
