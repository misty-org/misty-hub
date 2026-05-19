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
    assets: Vec<ReleaseAsset>,
}

#[derive(Debug, Deserialize)]
struct ReleaseAsset {
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
async fn install_misty(manifest_url: String, version: String) -> Result<String, String> {
    let manifest = fetch_manifest(&manifest_url).await?;
    let platform = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    let matching_assets: Vec<_> = manifest
        .assets
        .iter()
        .filter(|asset| asset.platform == platform)
        .collect();

    if matching_assets.is_empty() {
        return Err(format!("No Misty assets found for platform {platform}"));
    }

    for asset in matching_assets {
        // TODO: Download to a temp file, verify SHA256, then atomically install.
        // Keep the downloader isolated so private auth can move from dev token to broker URLs.
        let _ = (&asset.name, &asset.url, &asset.sha256);
    }

    let resolved_version = if manifest.version.trim().is_empty() {
        version
    } else {
        manifest.version
    };

    Ok(format!(
        "Prepared Misty {resolved_version} for {platform}. Download/install steps are scaffolded next."
    ))
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
