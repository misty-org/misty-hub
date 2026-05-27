use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{self, Cursor},
    path::{Component, Path, PathBuf},
    process::Command,
};
use zip::ZipArchive;

#[derive(Debug, Serialize)]
struct NativeSystemInfo {
    os: String,
    arch: String,
    misty_home: String,
    install_dir: String,
    legacy_install_dir: String,
    db_path: String,
    setup_path: String,
    current_user: Option<CurrentUser>,
}

#[derive(Debug, Serialize)]
struct PathProbe {
    path: String,
    exists: bool,
    is_dir: bool,
    is_file: bool,
}

#[derive(Debug, Deserialize, Serialize)]
struct CurrentUser {
    id: String,
    name: String,
    email: String,
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
    #[serde(default, rename = "sha256")]
    _sha256: String,
}

#[tauri::command]
fn check_system() -> Result<NativeSystemInfo, String> {
    ensure_database()?;
    let home = misty_home_dir()?;
    let install_dir = misty_bin_dir()?;
    let legacy_install_dir = legacy_misty_bin_dir()?;
    let db_path = misty_db_path()?;
    let current_user = current_user()?;
    let setup_path = std::env::current_exe()
        .unwrap_or_else(|_| PathBuf::from("Misty Setup"))
        .display()
        .to_string();

    Ok(NativeSystemInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        misty_home: home.display().to_string(),
        install_dir: install_dir.display().to_string(),
        legacy_install_dir: legacy_install_dir.display().to_string(),
        db_path: db_path.display().to_string(),
        setup_path,
        current_user,
    })
}

#[tauri::command]
fn ensure_misty_folders(folders: Vec<String>) -> Result<Vec<PathProbe>, String> {
    let home = misty_home_dir()?;
    let mut created = Vec::new();
    for folder in folders {
        let path = safe_misty_home_child(&home, &folder)
            .ok_or_else(|| format!("Unsafe Misty folder path: {folder}"))?;
        fs::create_dir_all(&path)
            .map_err(|error| format!("Could not create {}: {error}", path.display()))?;
        created.push(path);
    }

    Ok(created.iter().map(|path| probe_path(path)).collect())
}

#[tauri::command]
fn probe_paths(paths: Vec<String>) -> Result<Vec<PathProbe>, String> {
    Ok(paths.iter().map(|path| probe_path(Path::new(path))).collect())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://mistysys.com/") {
        return Err("Only mistysys.com links can be opened externally.".to_string());
    }

    open_url_in_system_browser(&url)
        .map_err(|error| format!("Could not open {url} in the system browser: {error}"))
}

#[tauri::command]
async fn install_misty(manifest_url: String, version: String) -> Result<String, String> {
    ensure_database()?;
    if current_user()?.is_none() {
        return Err("Sign in to Misty before installing.".to_string());
    }

    let client = reqwest::Client::new();
    let manifest = fetch_manifest(&client, &manifest_url).await?;
    let platform = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    let home = misty_home_dir()?;
    let install_dir = misty_bin_dir()?;
    fs::create_dir_all(&install_dir)
        .map_err(|error| format!("Could not create install directory: {error}"))?;
    let matching_assets: Vec<_> = manifest
        .assets
        .iter()
        .filter(|asset| asset.platform == platform)
        .collect();

    if matching_assets.is_empty() {
        return Err(format!("No Misty assets found for platform {platform}"));
    }

    let asset_count = matching_assets.len();
    for asset in matching_assets {
        if !asset_is_zip(asset) {
            return Err(format!(
                "Unsupported asset type for {}. Misty Setup currently expects .zip assets.",
                asset.name
            ));
        }

        let archive = download_asset(&client, asset).await?;
        extract_zip_archive(&archive, &home)
            .map_err(|error| format!("Could not extract {}: {error}", asset.name))?;
    }

    let resolved_version = if manifest.version.trim().is_empty() {
        version
    } else {
        manifest.version
    };

    Ok(format!(
        "Installed Misty {resolved_version} for {platform} to {} from {asset_count} asset(s).",
        install_dir.display()
    ))
}

#[tauri::command]
fn sign_out_misty() -> Result<NativeSystemInfo, String> {
    ensure_database()?;
    let conn = Connection::open(misty_db_path()?)
        .map_err(|error| format!("Could not open Misty database: {error}"))?;
    bootstrap_database(&conn)
        .map_err(|error| format!("Could not initialize Misty database: {error}"))?;
    conn.execute_batch(
        r#"
        DELETE FROM refresh_tokens;
        DELETE FROM revoked_access_tokens;
        DELETE FROM users;
        "#,
    )
    .map_err(|error| format!("Could not sign out of Misty: {error}"))?;

    check_system()
}

#[tauri::command]
fn save_authenticated_user(user: CurrentUser) -> Result<NativeSystemInfo, String> {
    ensure_database()?;
    let conn = Connection::open(misty_db_path()?)
        .map_err(|error| format!("Could not open Misty database: {error}"))?;
    bootstrap_database(&conn)
        .map_err(|error| format!("Could not initialize Misty database: {error}"))?;
    conn.execute_batch("DELETE FROM users;")
        .map_err(|error| format!("Could not clear previous Misty user: {error}"))?;
    conn.execute(
        "INSERT INTO users (id, name, email) VALUES (?1, ?2, ?3)",
        params![user.id, user.name, user.email],
    )
    .map_err(|error| format!("Could not save Misty user: {error}"))?;

    check_system()
}

async fn fetch_manifest(
    client: &reqwest::Client,
    manifest_url: &str,
) -> Result<ReleaseManifest, String> {
    authed_get(client, manifest_url)
        .send()
        .await
        .map_err(|error| format!("Could not fetch manifest: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Manifest request failed: {error}"))?
        .json::<ReleaseManifest>()
        .await
        .map_err(|error| format!("Manifest JSON was invalid: {error}"))
}

async fn download_asset(client: &reqwest::Client, asset: &ReleaseAsset) -> Result<Vec<u8>, String> {
    authed_get(client, &asset.url)
        .send()
        .await
        .map_err(|error| format!("Could not download {}: {error}", asset.name))?
        .error_for_status()
        .map_err(|error| format!("Download failed for {}: {error}", asset.name))?
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|error| format!("Could not read {} download body: {error}", asset.name))
}

fn authed_get(client: &reqwest::Client, url: &str) -> reqwest::RequestBuilder {
    let request = client.get(url);

    match std::env::var("MISTY_DOWNLOAD_TOKEN") {
        Ok(token) if !token.trim().is_empty() => request.bearer_auth(token),
        _ => request,
    }
}

fn extract_zip_archive(archive_bytes: &[u8], misty_home: &Path) -> io::Result<()> {
    let reader = Cursor::new(archive_bytes);
    let mut archive = ZipArchive::new(reader)?;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let Some(out_path) = release_entry_destination(misty_home, entry.name()) else {
            continue;
        };

        if entry.is_dir() {
            fs::create_dir_all(&out_path)?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut out_file = File::create(&out_path)?;
        io::copy(&mut entry, &mut out_file)?;

        #[cfg(unix)]
        if let Some(mode) = entry.unix_mode() {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&out_path, fs::Permissions::from_mode(mode))?;
        }
    }

    Ok(())
}

fn asset_is_zip(asset: &ReleaseAsset) -> bool {
    asset.name.to_ascii_lowercase().ends_with(".zip")
        || asset.url.to_ascii_lowercase().ends_with(".zip")
}

fn ensure_database() -> Result<(), String> {
    fs::create_dir_all(misty_db_dir()?)
        .map_err(|error| format!("Could not create Misty database directory: {error}"))?;
    let conn = Connection::open(misty_db_path()?)
        .map_err(|error| format!("Could not open Misty database: {error}"))?;
    bootstrap_database(&conn)
        .map_err(|error| format!("Could not initialize Misty database: {error}"))
}

fn release_entry_destination(misty_home: &Path, entry_name: &str) -> Option<PathBuf> {
    let entry_path = Path::new(entry_name);
    if entry_path.is_absolute() {
        return None;
    }

    let mut components = entry_path.components();
    let first = match components.next()? {
        Component::Normal(value) => value.to_string_lossy().to_string(),
        _ => return None,
    };

    let mut relative = PathBuf::new();
    for component in components {
        match component {
            Component::Normal(value) => relative.push(value),
            Component::CurDir => {}
            _ => return None,
        }
    }

    let mut destination = match first.as_str() {
        "bin" => misty_home.join(".local").join("bin"),
        "assets" => misty_home.join("assets"),
        "scripts" => misty_home.join("scripts"),
        other => misty_home.join(other),
    };
    destination.push(relative);
    Some(destination)
}

fn safe_misty_home_child(home: &Path, relative: &str) -> Option<PathBuf> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute() {
        return None;
    }

    let mut safe = PathBuf::new();
    for component in relative_path.components() {
        match component {
            Component::Normal(value) => safe.push(value),
            Component::CurDir => {}
            _ => return None,
        }
    }

    Some(home.join(safe))
}

fn probe_path(path: &Path) -> PathProbe {
    PathProbe {
        path: path.display().to_string(),
        exists: path.exists(),
        is_dir: path.is_dir(),
        is_file: path.is_file(),
    }
}

fn open_url_in_system_browser(url: &str) -> io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(url).spawn()?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd").args(["/C", "start", "", url]).spawn()?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(url).spawn()?;
        return Ok(());
    }
}

fn bootstrap_database(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS files (
            file_path TEXT PRIMARY KEY,
            mtime INTEGER NOT NULL,
            size INTEGER NOT NULL,
            is_dir INTEGER NOT NULL DEFAULT 0,
            hash TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            token_valid_after TEXT
        );

        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            encrypted_token TEXT NOT NULL DEFAULT '',
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            revoked INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
            ON refresh_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
            ON refresh_tokens(token_hash);

        CREATE TABLE IF NOT EXISTS revoked_access_tokens (
            token_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            revoked_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_revoked_access_tokens_user_id
            ON revoked_access_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_revoked_access_tokens_expires_at
            ON revoked_access_tokens(expires_at);
        "#,
    )
}

fn current_user() -> Result<Option<CurrentUser>, String> {
    let conn = Connection::open(misty_db_path()?)
        .map_err(|error| format!("Could not open Misty database: {error}"))?;
    bootstrap_database(&conn)
        .map_err(|error| format!("Could not initialize Misty database: {error}"))?;

    conn.query_row(
        "SELECT id, name, email FROM users ORDER BY rowid ASC LIMIT 1",
        params![],
        |row| {
            Ok(CurrentUser {
                id: row.get(0)?,
                name: row.get(1)?,
                email: row.get(2)?,
            })
        },
    )
    .optional()
    .map_err(|error| format!("Could not read signed in Misty user: {error}"))
}

fn misty_home_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(".misty"))
        .ok_or_else(|| "Could not resolve home directory".to_string())
}

fn misty_bin_dir() -> Result<PathBuf, String> {
    misty_home_dir().map(|home| home.join(".local").join("bin"))
}

fn legacy_misty_bin_dir() -> Result<PathBuf, String> {
    misty_home_dir().map(|home| home.join("local").join("bin"))
}

fn misty_db_dir() -> Result<PathBuf, String> {
    misty_home_dir().map(|home| home.join("db"))
}

fn misty_db_path() -> Result<PathBuf, String> {
    misty_home_dir().map(|home| home.join("db").join("data.db"))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            check_system,
            ensure_misty_folders,
            install_misty,
            open_external_url,
            probe_paths,
            save_authenticated_user,
            sign_out_misty
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        io::{Cursor, Write},
        time::{SystemTime, UNIX_EPOCH},
    };
    use zip::{write::SimpleFileOptions, ZipWriter};

    fn temp_misty_home() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should be available")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("misty-setup-test-{unique}"));
        fs::create_dir_all(&path).expect("temp home should be created");
        path
    }

    #[test]
    fn maps_release_roots_to_misty_home_destinations() {
        let home = PathBuf::from("/tmp/misty-home");

        assert_eq!(
            release_entry_destination(&home, "bin/misty").unwrap(),
            home.join(".local/bin/misty")
        );
        assert_eq!(
            release_entry_destination(&home, "assets/themes/default.css").unwrap(),
            home.join("assets/themes/default.css")
        );
        assert_eq!(
            release_entry_destination(&home, "scripts/bootstrap.sh").unwrap(),
            home.join("scripts/bootstrap.sh")
        );
        assert_eq!(
            release_entry_destination(&home, "plugins/public/example/plugin.json").unwrap(),
            home.join("plugins/public/example/plugin.json")
        );
    }

    #[test]
    fn rejects_unsafe_archive_entries() {
        let home = PathBuf::from("/tmp/misty-home");

        assert!(release_entry_destination(&home, "../misty").is_none());
        assert!(release_entry_destination(&home, "bin/../../misty").is_none());
        assert!(release_entry_destination(&home, "/bin/misty").is_none());
    }

    #[test]
    fn extracts_only_paths_present_in_zip() {
        let home = temp_misty_home();
        fs::create_dir_all(home.join("assets/themes")).expect("assets dir should exist");
        fs::write(home.join("assets/themes/user.css"), "keep")
            .expect("unrelated file should be written");
        fs::write(home.join("assets/themes/default.css"), "old")
            .expect("old release file should be written");

        let mut cursor = Cursor::new(Vec::new());
        {
            let mut zip = ZipWriter::new(&mut cursor);
            let options = SimpleFileOptions::default().unix_permissions(0o755);
            zip.start_file("bin/misty", options).unwrap();
            zip.write_all(b"misty-bin").unwrap();
            zip.start_file("assets/themes/default.css", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(b"new").unwrap();
            zip.start_file("scripts/bootstrap.sh", options).unwrap();
            zip.write_all(b"#!/bin/sh\n").unwrap();
            zip.finish().unwrap();
        }

        extract_zip_archive(&cursor.into_inner(), &home).expect("zip should extract");

        assert_eq!(fs::read(home.join(".local/bin/misty")).unwrap(), b"misty-bin");
        assert_eq!(
            fs::read_to_string(home.join("assets/themes/default.css")).unwrap(),
            "new"
        );
        assert_eq!(
            fs::read_to_string(home.join("assets/themes/user.css")).unwrap(),
            "keep"
        );
        assert!(home.join("scripts/bootstrap.sh").is_file());

        fs::remove_dir_all(home).ok();
    }

    #[test]
    fn probes_path_presence() {
        let home = temp_misty_home();
        fs::create_dir_all(home.join(".local/bin")).expect("bin dir should be created");
        fs::write(home.join(".local/bin/misty"), "misty").expect("binary should be written");

        let home_probe = probe_path(&home);
        let binary_probe = probe_path(&home.join(".local/bin/misty"));
        let missing_probe = probe_path(&home.join(".local/bin/misty-proxy"));

        assert!(home_probe.exists);
        assert!(home_probe.is_dir);
        assert!(binary_probe.exists);
        assert!(binary_probe.is_file);
        assert!(!missing_probe.exists);

        fs::remove_dir_all(home).ok();
    }
}
