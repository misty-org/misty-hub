use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs::{self, File},
    io::{self, Cursor},
    path::{Component, Path, PathBuf},
    process::Command,
    thread,
    time::{Duration, Instant},
};
use tauri::{
    image::Image,
    menu::{IconMenuItem, IconMenuItemBuilder, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent, Wry,
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
    #[serde(alias = "assets", default)]
    artifacts: Vec<ReleaseArtifact>,
}

#[derive(Debug, Deserialize)]
struct ReleaseArtifact {
    name: String,
    platform: String,
    url: String,
    #[serde(default, rename = "sha256")]
    _sha256: String,
}

#[derive(Debug, Serialize, Clone)]
struct PluginLink {
    label: String,
    url: String,
}

#[derive(Debug, Serialize, Clone)]
struct PluginAction {
    label: String,
    kind: String,
}

#[derive(Debug, Serialize, Clone)]
struct PluginLauncher {
    views: Vec<String>,
    show_in_launcher: bool,
    requires_selected_file: bool,
    open_mode: String,
}

#[derive(Debug, Serialize, Clone)]
struct LocalPluginRecord {
    id: String,
    name: String,
    version: String,
    author: String,
    overview: String,
    status: String,
    root: String,
    enabled: bool,
    installed: bool,
    verified: bool,
    manifest_path: String,
    plugin_dir: String,
    logo_path: Option<String>,
    capabilities: Vec<String>,
    where_it_appears: Vec<String>,
    permissions: Vec<String>,
    getting_started: Vec<String>,
    changelog: Vec<String>,
    links: Vec<PluginLink>,
    actions: Vec<PluginAction>,
    launcher: PluginLauncher,
}

const TRAY_OPEN_HUB: &str = "tray_open_hub";
const TRAY_OPEN_MISTY: &str = "tray_open_misty";
const TRAY_STOP_MISTY: &str = "tray_stop_misty";
const TRAY_RESTART_MISTY: &str = "tray_restart_misty";
const TRAY_STOP_HUB: &str = "tray_stop_hub";
const TRAY_RESTART_HUB: &str = "tray_restart_hub";
const TRAY_STOP_SERVICES: &str = "tray_stop_services";
const TRAY_RESTART_SERVICES: &str = "tray_restart_services";
const TRAY_QUIT_ALL: &str = "tray_quit_all";

#[derive(Debug, Serialize, Clone, Default)]
struct MistyProcessStatus {
    misty_hub_pid: u32,
    misty_pid: Option<u32>,
    misty_proxy_pid: Option<u32>,
    misty_proxy_port: Option<u16>,
    misty_rclone_port: Option<u16>,
}

struct HubTrayState {
    _tray_icon: tauri::tray::TrayIcon<Wry>,
    hub_status_item: IconMenuItem<Wry>,
    misty_status_item: IconMenuItem<Wry>,
    proxy_status_item: IconMenuItem<Wry>,
    rclone_status_item: IconMenuItem<Wry>,
    open_hub_item: MenuItem<Wry>,
    stop_hub_item: MenuItem<Wry>,
    restart_hub_item: MenuItem<Wry>,
    open_misty_item: MenuItem<Wry>,
    stop_misty_item: MenuItem<Wry>,
    restart_misty_item: MenuItem<Wry>,
    stop_services_item: MenuItem<Wry>,
    restart_services_item: MenuItem<Wry>,
}

#[cfg(target_os = "windows")]
fn find_running_pid(name: &str) -> Option<u32> {
    let image_name = format!("{name}.exe");
    let filter = format!("IMAGENAME eq {image_name}");
    let output = Command::new("tasklist")
        .args(["/FI", &filter, "/FO", "CSV", "/NH"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if !line.starts_with(&format!("\"{image_name}\"")) {
            continue;
        }
        let fields: Vec<_> = line.trim_matches('"').split("\",\"").collect();
        if fields.len() > 1 {
            if let Ok(pid) = fields[1].replace(',', "").parse::<u32>() {
                return Some(pid);
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn find_running_pid(name: &str) -> Option<u32> {
    let output = Command::new("pgrep").args(["-x", name]).output().ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find_map(|line| line.trim().parse::<u32>().ok())
}

fn current_misty_process_status() -> MistyProcessStatus {
    let misty_pid = find_running_pid("misty");
    let misty_proxy_pid = find_running_pid("misty-proxy");

    MistyProcessStatus {
        misty_hub_pid: std::process::id(),
        misty_pid,
        misty_proxy_pid,
        misty_proxy_port: misty_proxy_pid.and_then(|_| read_proxy_port_from_config()),
        misty_rclone_port: find_misty_rclone_rcd_port(),
    }
}

#[cfg(target_os = "windows")]
fn find_misty_rclone_rcd_port() -> Option<u16> {
    None
}

#[cfg(not(target_os = "windows"))]
fn find_misty_rclone_rcd_port() -> Option<u16> {
    let output = Command::new("ps")
        .args(["-axo", "command="])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|command| {
            command.contains("/.misty/rclone/rclone")
                && command.contains(" rcd")
                && command.contains("--rc-addr")
        })
        .and_then(extract_port_from_command_line)
}

fn extract_port_from_command_line(command: &str) -> Option<u16> {
    let parts: Vec<_> = command.split_whitespace().collect();

    for index in 0..parts.len() {
        let part = parts[index];
        let value = if let Some(value) = part.strip_prefix("--rc-addr=") {
            Some(value)
        } else if part == "--rc-addr" {
            parts.get(index + 1).copied()
        } else {
            None
        };

        if let Some(addr) = value {
            return extract_port_from_addr(addr);
        }
    }

    None
}

fn extract_port_from_addr(addr: &str) -> Option<u16> {
    let trimmed = addr.trim_matches('"').trim_matches('\'');
    let port = trimmed.rsplit(':').next()?;
    port.parse::<u16>().ok()
}

fn status_icon(running: bool) -> Result<Image<'static>, String> {
    let bytes: &[u8] = if running {
        &include_bytes!("../icons/status-green.png")[..]
    } else {
        &include_bytes!("../icons/status-red.png")[..]
    };
    Image::from_bytes(bytes).map_err(|error| format!("Could not load status icon: {error}"))
}

fn misty_binary_path() -> Result<PathBuf, String> {
    let path = misty_bin_dir()?.join("misty");
    if path.is_file() {
        Ok(path)
    } else {
        Err(format!("Misty binary was not found at {}.", path.display()))
    }
}

fn open_misty_app() -> Result<(), String> {
    let misty_path = misty_binary_path()?;
    Command::new(&misty_path)
        .spawn()
        .map_err(|error| format!("Could not open Misty from {}: {error}", misty_path.display()))?;
    Ok(())
}

fn main_hub_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<tauri::WebviewWindow<R>> {
    app.get_webview_window("main")
        .or_else(|| app.webview_windows().into_values().next())
}

fn show_hub_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let window =
        main_hub_window(app).ok_or_else(|| "Could not find the Misty Hub window.".to_string())?;
    window
        .show()
        .map_err(|error| format!("Could not show Misty Hub: {error}"))?;
    window
        .unminimize()
        .map_err(|error| format!("Could not unminimize Misty Hub: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("Could not focus Misty Hub: {error}"))?;
    Ok(())
}

fn hide_hub_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    if let Some(window) = main_hub_window(app) {
        window
            .hide()
            .map_err(|error| format!("Could not hide Misty Hub: {error}"))?;
    }
    Ok(())
}

fn restart_hub_app(app: &tauri::AppHandle<Wry>) -> Result<(), String> {
    let exe_path =
        std::env::current_exe().map_err(|error| format!("Could not locate Misty Hub: {error}"))?;
    Command::new(&exe_path)
        .spawn()
        .map_err(|error| format!("Could not relaunch Misty Hub from {}: {error}", exe_path.display()))?;
    app.exit(0);
    Ok(())
}

fn refresh_hub_tray(app: &tauri::AppHandle<Wry>) -> Result<(), String> {
    let status = current_misty_process_status();
    let tray = app.state::<HubTrayState>();
    let services_available = misty_bin_dir()
        .map(|dir| dir.join("misty-proxy").is_file())
        .unwrap_or(false);

    let hub_running = true;
    let rclone_running = status.misty_rclone_port.is_some() || status.misty_proxy_pid.is_some();
    let hub_label = format!("misty-hub: Running (pid {})", status.misty_hub_pid);
    let misty_label = match status.misty_pid {
        Some(pid) => format!("misty: Running (pid {pid})"),
        None => "misty: Stopped".to_string(),
    };
    let proxy_label = match status.misty_proxy_port {
        Some(port) => format!("misty-proxy: Running (port {port})"),
        None => "misty-proxy: Stopped".to_string(),
    };
    let rclone_label = match status.misty_rclone_port {
        Some(port) => format!("misty-rclone (rcd): Running (port {port})"),
        None if status.misty_proxy_pid.is_some() => "misty-rclone (rcd): Running".to_string(),
        None => "misty-rclone (rcd): Stopped".to_string(),
    };

    tray.hub_status_item
        .set_text(&hub_label)
        .map_err(|error| format!("Could not update Misty Hub tray status: {error}"))?;
    tray.hub_status_item
        .set_icon(Some(status_icon(hub_running)?))
        .map_err(|error| format!("Could not update Misty Hub tray icon: {error}"))?;
    tray.misty_status_item
        .set_text(&misty_label)
        .map_err(|error| format!("Could not update Misty tray status: {error}"))?;
    tray.misty_status_item
        .set_icon(Some(status_icon(status.misty_pid.is_some())?))
        .map_err(|error| format!("Could not update Misty tray icon: {error}"))?;
    tray.proxy_status_item
        .set_text(&proxy_label)
        .map_err(|error| format!("Could not update misty-proxy tray status: {error}"))?;
    tray.proxy_status_item
        .set_icon(Some(status_icon(status.misty_proxy_port.is_some())?))
        .map_err(|error| format!("Could not update misty-proxy tray icon: {error}"))?;
    tray.rclone_status_item
        .set_text(&rclone_label)
        .map_err(|error| format!("Could not update misty-rclone tray status: {error}"))?;
    tray.rclone_status_item
        .set_icon(Some(status_icon(rclone_running)?))
        .map_err(|error| format!("Could not update misty-rclone tray icon: {error}"))?;
    tray.open_hub_item
        .set_enabled(true)
        .map_err(|error| format!("Could not update open hub menu state: {error}"))?;
    tray.stop_hub_item
        .set_enabled(true)
        .map_err(|error| format!("Could not update stop hub menu state: {error}"))?;
    tray.restart_hub_item
        .set_enabled(true)
        .map_err(|error| format!("Could not update restart hub menu state: {error}"))?;
    tray.open_misty_item
        .set_enabled(true)
        .map_err(|error| format!("Could not update open misty menu state: {error}"))?;
    tray.stop_misty_item
        .set_enabled(status.misty_pid.is_some())
        .map_err(|error| format!("Could not update stop menu state: {error}"))?;
    tray.restart_misty_item
        .set_enabled(status.misty_pid.is_some())
        .map_err(|error| format!("Could not update restart menu state: {error}"))?;
    tray.stop_services_item
        .set_enabled(status.misty_proxy_pid.is_some())
        .map_err(|error| format!("Could not update stop services menu state: {error}"))?;
    tray.restart_services_item
        .set_enabled(services_available)
        .map_err(|error| format!("Could not update restart services menu state: {error}"))?;

    Ok(())
}

fn spawn_tray_status_worker(app: tauri::AppHandle<Wry>) {
    thread::spawn(move || loop {
        let _ = refresh_hub_tray(&app);
        thread::sleep(Duration::from_secs(3));
    });
}

fn build_hub_tray(app: &tauri::AppHandle<Wry>) -> Result<HubTrayState, String> {
    let tray_icon_image = Image::from_bytes(include_bytes!("../../public/misty-hub-toolbar.png"))
        .map_err(|error| format!("Could not load embedded tray icon: {error}"))?;

    let hub_status_item = IconMenuItemBuilder::with_id("tray_status_hub", "misty-hub: Checking...")
        .enabled(false)
        .icon(status_icon(true)?)
        .build(app)
    .map_err(|error| format!("Could not create Misty Hub status menu item: {error}"))?;
    let misty_status_item = IconMenuItemBuilder::with_id("tray_status_misty", "misty: Checking...")
        .enabled(false)
        .icon(status_icon(false)?)
        .build(app)
    .map_err(|error| format!("Could not create Misty status menu item: {error}"))?;
    let proxy_status_item =
        IconMenuItemBuilder::with_id("tray_status_proxy", "misty-proxy: Checking...")
            .enabled(false)
            .icon(status_icon(false)?)
            .build(app)
    .map_err(|error| format!("Could not create misty-proxy status menu item: {error}"))?;
    let rclone_status_item =
        IconMenuItemBuilder::with_id("tray_status_rclone", "misty-rclone (rcd): Checking...")
            .enabled(false)
            .icon(status_icon(false)?)
            .build(app)
    .map_err(|error| format!("Could not create misty-rclone status menu item: {error}"))?;
    let open_hub_item = MenuItem::with_id(app, TRAY_OPEN_HUB, "Open Misty Hub", true, None::<&str>)
        .map_err(|error| format!("Could not create Open Misty Hub menu item: {error}"))?;
    let stop_hub_item = MenuItem::with_id(app, TRAY_STOP_HUB, "Stop Misty Hub", true, None::<&str>)
        .map_err(|error| format!("Could not create Stop Misty Hub menu item: {error}"))?;
    let restart_hub_item =
        MenuItem::with_id(app, TRAY_RESTART_HUB, "Restart Misty Hub", true, None::<&str>)
            .map_err(|error| format!("Could not create Restart Misty Hub menu item: {error}"))?;
    let open_misty_item =
        MenuItem::with_id(app, TRAY_OPEN_MISTY, "Open Misty", true, None::<&str>)
            .map_err(|error| format!("Could not create Open Misty menu item: {error}"))?;
    let stop_misty_item = MenuItem::with_id(app, TRAY_STOP_MISTY, "Stop Misty", true, None::<&str>)
        .map_err(|error| format!("Could not create Stop Misty menu item: {error}"))?;
    let restart_misty_item =
        MenuItem::with_id(app, TRAY_RESTART_MISTY, "Restart Misty", true, None::<&str>)
            .map_err(|error| format!("Could not create Restart Misty menu item: {error}"))?;
    let stop_services_item =
        MenuItem::with_id(app, TRAY_STOP_SERVICES, "Stop Services", true, None::<&str>)
            .map_err(|error| format!("Could not create Stop Services menu item: {error}"))?;
    let restart_services_item =
        MenuItem::with_id(app, TRAY_RESTART_SERVICES, "Restart Services", true, None::<&str>)
            .map_err(|error| format!("Could not create Restart Services menu item: {error}"))?;
    let quit_all_item = MenuItem::with_id(app, TRAY_QUIT_ALL, "Quit Misty Hub", true, None::<&str>)
        .map_err(|error| format!("Could not create Quit menu item: {error}"))?;

    let menu = Menu::with_items(
        app,
        &[
            &hub_status_item,
            &open_hub_item,
            &stop_hub_item,
            &restart_hub_item,
            &PredefinedMenuItem::separator(app)
                .map_err(|error| format!("Could not create tray separator: {error}"))?,
            &misty_status_item,
            &open_misty_item,
            &stop_misty_item,
            &restart_misty_item,
            &PredefinedMenuItem::separator(app)
                .map_err(|error| format!("Could not create tray separator: {error}"))?,
            &proxy_status_item,
            &rclone_status_item,
            &restart_services_item,
            &stop_services_item,
            &PredefinedMenuItem::separator(app)
                .map_err(|error| format!("Could not create tray separator: {error}"))?,
            &quit_all_item,
        ],
    )
    .map_err(|error| format!("Could not create Misty Hub tray menu: {error}"))?;

    let tray_icon = TrayIconBuilder::with_id("misty-hub")
        .icon(tray_icon_image)
        .icon_as_template(false)
        .tooltip("Misty Hub")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .build(app)
        .map_err(|error| format!("Could not create Misty Hub tray icon: {error}"))?;

    Ok(HubTrayState {
        _tray_icon: tray_icon,
        hub_status_item,
        misty_status_item,
        proxy_status_item,
        rclone_status_item,
        open_hub_item,
        stop_hub_item,
        restart_hub_item,
        open_misty_item,
        stop_misty_item,
        restart_misty_item,
        stop_services_item,
        restart_services_item,
    })
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
        .unwrap_or_else(|_| PathBuf::from("Misty Hub"))
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
    Ok(paths
        .iter()
        .map(|path| probe_path(Path::new(path)))
        .collect())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only http and https links can be opened externally.".to_string());
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
    let matching_artifacts: Vec<_> = manifest
        .artifacts
        .iter()
        .filter(|artifact| artifact.platform == platform)
        .collect();

    if matching_artifacts.is_empty() {
        return Err(format!("No Misty artifacts found for platform {platform}"));
    }

    let artifact_count = matching_artifacts.len();
    for artifact in matching_artifacts {
        let artifact_debug = format!(
            "Matched artifact platform={} name={} url={}",
            artifact.platform, artifact.name, artifact.url
        );
        if !artifact_is_zip(artifact) {
            return Err(format!(
                "{}. Unsupported artifact type for {}. Misty Hub currently expects .zip artifacts.",
                artifact_debug, artifact.name
            ));
        }

        let archive = download_artifact(&client, artifact)
            .await
            .map_err(|error| format!("{artifact_debug}. {error}"))?;
        extract_zip_archive(&archive, &home)
            .map_err(|error| format!("{artifact_debug}. Could not extract {}: {error}", artifact.name))?;
    }

    let resolved_version = if manifest.version.trim().is_empty() {
        version
    } else {
        manifest.version
    };

    Ok(format!(
        "Installed Misty {resolved_version} for {platform} to {} from {artifact_count} artifact(s).",
        install_dir.display()
    ))
}

#[tauri::command]
<<<<<<< HEAD
fn launch_misty() -> Result<String, String> {
    let misty_path = misty_bin_dir()?.join(runtime_binary_name("misty"));
    let misty_proxy_path = misty_bin_dir()?.join(runtime_binary_name("misty-proxy"));
=======
fn get_misty_process_status() -> MistyProcessStatus {
    current_misty_process_status()
}

#[tauri::command]
fn launch_misty(app: tauri::AppHandle<Wry>) -> Result<String, String> {
    let misty_path = misty_bin_dir()?.join("misty");
    let misty_proxy_path = misty_bin_dir()?.join("misty-proxy");
    let status_before = current_misty_process_status();
>>>>>>> b15629d (fixing installer)

    if !misty_path.is_file() {
        return Err(format!(
            "Misty binary was not found at {}.",
            misty_path.display()
        ));
    }
    if !misty_proxy_path.is_file() {
        return Err(format!(
            "Misty proxy binary was not found at {}.",
            misty_proxy_path.display()
        ));
    }

    if status_before.misty_proxy_pid.is_none() {
        Command::new(&misty_proxy_path)
            .spawn()
            .map_err(|error| format!("Could not launch misty-proxy: {error}"))?;
    }

    if status_before.misty_pid.is_none() {
        Command::new(&misty_path)
            .spawn()
            .map_err(|error| format!("Could not launch Misty: {error}"))?;
    }

    let proxy_port_message = status_before
        .misty_proxy_pid
        .is_none()
        .then(wait_for_proxy_port)
        .flatten()
        .map(|port| format!(" misty-proxy is using port {port}."))
        .unwrap_or_default();

    let _ = refresh_hub_tray(&app);

    match (
        status_before.misty_pid.is_some(),
        status_before.misty_proxy_pid.is_some(),
    ) {
        (true, true) => Ok("Misty and misty-proxy are already running.".to_string()),
        (true, false) => Ok(format!(
            "Launched misty-proxy. Misty was already running.{proxy_port_message}"
        )),
        (false, true) => Ok("Launched Misty. misty-proxy was already running.".to_string()),
        (false, false) => Ok(format!(
            "Launched misty-proxy and Misty.{proxy_port_message}"
        )),
    }
}

fn wait_for_proxy_port() -> Option<u16> {
    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline {
        if let Some(port) = read_proxy_port_from_config() {
            return Some(port);
        }
        thread::sleep(Duration::from_millis(100));
    }
    read_proxy_port_from_config()
}

fn launch_services_only() -> Result<String, String> {
    let misty_proxy_path = misty_bin_dir()?.join("misty-proxy");
    if !misty_proxy_path.is_file() {
        return Err(format!(
            "Misty proxy binary was not found at {}.",
            misty_proxy_path.display()
        ));
    }

    if find_running_pid("misty-proxy").is_some() {
        return Ok("misty-proxy is already running.".to_string());
    }

    Command::new(&misty_proxy_path)
        .spawn()
        .map_err(|error| format!("Could not launch misty-proxy: {error}"))?;

    let proxy_port_message = wait_for_proxy_port()
        .map(|port| format!(" misty-proxy is using port {port}."))
        .unwrap_or_default();

    Ok(format!("Launched misty-proxy.{proxy_port_message}"))
}

fn read_proxy_port_from_config() -> Option<u16> {
    let config_path = misty_home_dir().ok()?.join("config").join("misty.json");
    let body = fs::read_to_string(config_path).ok()?;
    let value: Value = serde_json::from_str(&body).ok()?;
    let port = value.get("proxy")?.get("port")?.as_u64()?;
    u16::try_from(port).ok()
}

fn stop_named_processes(names: &[&str]) -> Result<usize, String> {
    #[cfg(target_os = "windows")]
    {
        let mut stopped = 0;
        for name in names {
            let target = format!("{name}.exe");
            let output = Command::new("taskkill")
                .args(["/IM", &target, "/F"])
                .output()
                .map_err(|error| format!("Could not run taskkill for {target}: {error}"))?;

            if output.status.success() {
                stopped += 1;
                continue;
            }

            let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
            if stderr.contains("not found") || stderr.contains("no running instance") {
                continue;
            }

            return Err(format!(
                "Could not stop {target}: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }

        Ok(stopped)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut stopped = 0;
        for name in names {
            let status = Command::new("pkill")
                .args(["-x", name])
                .status()
                .map_err(|error| format!("Could not run pkill for {name}: {error}"))?;

            match status.code() {
                Some(0) => stopped += 1,
                Some(1) => {}
                Some(code) => {
                    return Err(format!(
                        "pkill exited with status {code} while stopping {name}."
                    ));
                }
                None => {
                    return Err(format!(
                        "pkill terminated unexpectedly while stopping {name}."
                    ))
                }
            }
        }

        Ok(stopped)
    }
}

fn stop_services_processes() -> Result<usize, String> {
    stop_named_processes(&["misty-proxy"])
}

#[tauri::command]
fn stop_misty(app: tauri::AppHandle<Wry>) -> Result<String, String> {
    let stopped = stop_named_processes(&["misty", "misty-proxy"])?;
    let _ = refresh_hub_tray(&app);

    if stopped == 0 {
        Ok("No running Misty processes were found.".to_string())
    } else {
        Ok("Stopped Misty and misty-proxy.".to_string())
    }
}

#[tauri::command]
fn restart_misty(app: tauri::AppHandle<Wry>) -> Result<String, String> {
    let stopped = stop_named_processes(&["misty", "misty-proxy"])?;
    let launch_message = launch_misty(app.clone())?;

    if stopped == 0 {
        Ok(format!(
            "No running Misty processes were found. {launch_message}"
        ))
    } else {
        Ok(format!("Restarted Misty and misty-proxy. {launch_message}"))
    }
}

#[tauri::command]
fn scan_local_plugins() -> Result<Vec<LocalPluginRecord>, String> {
    let mut plugins = Vec::new();
    for root_kind in ["private", "public"] {
        let root_dir = misty_plugin_root_dir(root_kind)?;
        if !root_dir.exists() {
            continue;
        }

        let entries = fs::read_dir(&root_dir)
            .map_err(|error| format!("Could not read {}: {error}", root_dir.display()))?;
        for entry in entries {
            let entry = entry.map_err(|error| format!("Could not read plugin entry: {error}"))?;
            let plugin_dir = entry.path();
            if !plugin_dir.is_dir() {
                continue;
            }
            if let Some(plugin) = read_local_plugin_record(&plugin_dir, root_kind)? {
                plugins.push(plugin);
            }
        }
    }

    plugins.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(plugins)
}

#[tauri::command]
async fn install_plugin_bundle(
    plugin_id: String,
    root: String,
    url: String,
) -> Result<String, String> {
    if plugin_id.trim().is_empty() {
        return Err("Plugin id is required.".to_string());
    }
    if !matches!(root.as_str(), "public" | "private") {
        return Err(format!("Unsupported plugin root: {root}"));
    }
    if url.trim().is_empty() {
        return Err("Plugin artifact URL is required.".to_string());
    }
    if !url.to_ascii_lowercase().ends_with(".zip") {
        return Err("Plugin install currently expects a .zip bundle.".to_string());
    }

    let client = reqwest::Client::new();
    let bytes = authed_get(&client, &url)
        .send()
        .await
        .map_err(|error| format!("Could not download plugin bundle: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Plugin download failed: {error}"))?
        .bytes()
        .await
        .map_err(|error| format!("Could not read plugin bundle: {error}"))?;

    let root_dir = misty_plugin_root_dir(&root)?;
    fs::create_dir_all(&root_dir).map_err(|error| {
        format!(
            "Could not create plugin root {}: {error}",
            root_dir.display()
        )
    })?;
    extract_plugin_zip_archive(&bytes, &root_dir, &plugin_id)
        .map_err(|error| format!("Could not extract plugin bundle: {error}"))?;

    Ok(format!(
        "Installed plugin {plugin_id} into {}.",
        root_dir.join(&plugin_id).display()
    ))
}

#[tauri::command]
fn uninstall_plugin(plugin_id: String, root: String) -> Result<String, String> {
    if plugin_id.trim().is_empty() {
        return Err("Plugin id is required.".to_string());
    }
    let plugin_dir = misty_plugin_root_dir(&root)?.join(&plugin_id);
    if !plugin_dir.exists() {
        return Err(format!(
            "Plugin directory was not found at {}.",
            plugin_dir.display()
        ));
    }
    fs::remove_dir_all(&plugin_dir)
        .map_err(|error| format!("Could not remove {}: {error}", plugin_dir.display()))?;
    Ok(format!("Removed plugin {plugin_id}."))
}

#[tauri::command]
fn set_plugin_enabled(plugin_id: String, root: String, enabled: bool) -> Result<String, String> {
    if plugin_id.trim().is_empty() {
        return Err("Plugin id is required.".to_string());
    }

    let manifest_path = misty_plugin_root_dir(&root)?
        .join(&plugin_id)
        .join("manifest.json");
    let manifest_text = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Could not read {}: {error}", manifest_path.display()))?;
    let mut manifest_json: Value = parse_json_relaxed(&manifest_text)
        .ok_or_else(|| format!("Manifest JSON was invalid at {}.", manifest_path.display()))?;
    let object = manifest_json.as_object_mut().ok_or_else(|| {
        format!(
            "Manifest at {} was not a JSON object.",
            manifest_path.display()
        )
    })?;
    object.insert("enabled".to_string(), json!(enabled));
    let next_manifest = serde_json::to_string_pretty(&manifest_json)
        .map_err(|error| format!("Could not serialize plugin manifest: {error}"))?;
    fs::write(&manifest_path, format!("{next_manifest}\n"))
        .map_err(|error| format!("Could not write {}: {error}", manifest_path.display()))?;

    Ok(format!(
        "{} plugin {plugin_id}.",
        if enabled { "Enabled" } else { "Disabled" }
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

async fn download_artifact(client: &reqwest::Client, artifact: &ReleaseArtifact) -> Result<Vec<u8>, String> {
    authed_get(client, &artifact.url)
        .send()
        .await
        .map_err(|error| format!("Could not download {}: {error}", artifact.name))?
        .error_for_status()
        .map_err(|error| format!("Download failed for {}: {error}", artifact.name))?
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|error| format!("Could not read {} download body: {error}", artifact.name))
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

fn artifact_is_zip(artifact: &ReleaseArtifact) -> bool {
    artifact.name.to_ascii_lowercase().ends_with(".zip")
        || artifact.url.to_ascii_lowercase().ends_with(".zip")
}

fn extract_plugin_zip_archive(
    archive_bytes: &[u8],
    plugin_root: &Path,
    plugin_id: &str,
) -> io::Result<()> {
    let target_dir = plugin_root.join(plugin_id);
    if target_dir.exists() {
        fs::remove_dir_all(&target_dir)?;
    }
    fs::create_dir_all(&target_dir)?;

    let reader = Cursor::new(archive_bytes);
    let mut archive = ZipArchive::new(reader)?;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let Some(relative_path) = plugin_archive_relative_path(entry.name(), plugin_id) else {
            continue;
        };
        let out_path = target_dir.join(relative_path);

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

    if !target_dir.join("manifest.json").is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Plugin bundle did not contain manifest.json",
        ));
    }

    Ok(())
}

fn plugin_archive_relative_path(entry_name: &str, plugin_id: &str) -> Option<PathBuf> {
    let entry_path = Path::new(entry_name);
    if entry_path.is_absolute() {
        return None;
    }

    let mut components = Vec::new();
    for component in entry_path.components() {
        match component {
            Component::Normal(value) => components.push(value.to_string_lossy().to_string()),
            Component::CurDir => {}
            _ => return None,
        }
    }

    if components.is_empty() {
        return None;
    }

    let slice = if components[0] == plugin_id {
        &components[1..]
    } else {
        &components[..]
    };

    if slice.is_empty() {
        return None;
    }

    let mut relative = PathBuf::new();
    for part in slice {
        relative.push(part);
    }
    Some(relative)
}

fn misty_plugin_root_dir(root: &str) -> Result<PathBuf, String> {
    match root {
        "public" => misty_home_dir().map(|home| home.join("plugins").join("public")),
        "private" => misty_home_dir().map(|home| home.join("plugins").join("private")),
        _ => Err(format!("Unsupported plugin root: {root}")),
    }
}

fn read_local_plugin_record(
    plugin_dir: &Path,
    root: &str,
) -> Result<Option<LocalPluginRecord>, String> {
    let manifest_path = plugin_dir.join("manifest.json");
    if !manifest_path.is_file() {
        return Ok(None);
    }

    let manifest_text = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Could not read {}: {error}", manifest_path.display()))?;
    let manifest_json: Value = parse_json_relaxed(&manifest_text).unwrap_or_else(|| json!({}));
    let detail_json = plugin_dir
        .join("plugin.json")
        .is_file()
        .then(|| fs::read_to_string(plugin_dir.join("plugin.json")))
        .transpose()
        .map_err(|error| {
            format!(
                "Could not read plugin metadata in {}: {error}",
                plugin_dir.display()
            )
        })?
        .and_then(|text| serde_json::from_str::<Value>(&text).ok());

    let manifest_enabled = manifest_json
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(true);

    let plugin_json = detail_json.unwrap_or_else(|| json!({}));
    let id = string_field(&plugin_json, &manifest_json, "id").unwrap_or_else(|| {
        plugin_dir
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "plugin".to_string())
    });
    let name = string_field(&plugin_json, &manifest_json, "name").unwrap_or_else(|| id.clone());
    let version = string_field(&plugin_json, &manifest_json, "version")
        .unwrap_or_else(|| "0.0.0".to_string());
    let author = string_field(&plugin_json, &manifest_json, "author").unwrap_or_default();
    let overview = string_field(&plugin_json, &manifest_json, "overview")
        .or_else(|| string_field(&plugin_json, &manifest_json, "description"))
        .unwrap_or_default();
    let status = if manifest_enabled {
        "installed"
    } else {
        "disabled"
    }
    .to_string();
    let verified = plugin_json
        .get("verified")
        .and_then(Value::as_bool)
        .or_else(|| manifest_json.get("verified").and_then(Value::as_bool))
        .unwrap_or(false);

    Ok(Some(LocalPluginRecord {
        id,
        name,
        version,
        author,
        overview,
        status,
        root: root.to_string(),
        enabled: manifest_enabled,
        installed: true,
        verified,
        manifest_path: manifest_path.display().to_string(),
        plugin_dir: plugin_dir.display().to_string(),
        logo_path: plugin_logo_path(plugin_dir),
        capabilities: string_list(&plugin_json, "capabilities"),
        where_it_appears: string_list(&plugin_json, "where_it_appears"),
        permissions: string_list(&plugin_json, "permissions"),
        getting_started: string_list(&plugin_json, "getting_started"),
        changelog: string_list(&plugin_json, "changelog"),
        links: plugin_links(&plugin_json),
        actions: plugin_actions(&plugin_json),
        launcher: plugin_launcher(&plugin_json, &manifest_json),
    }))
}

fn plugin_logo_path(plugin_dir: &Path) -> Option<String> {
    let assets_dir = plugin_dir.join("assets");
    [
        assets_dir.join("logo.svg"),
        assets_dir.join("logo.png"),
        assets_dir.join("icon.svg"),
        assets_dir.join("icon.png"),
    ]
    .into_iter()
    .find(|path| path.is_file())
    .map(|path| path.display().to_string())
}

fn parse_json_relaxed(text: &str) -> Option<Value> {
    serde_json::from_str(text)
        .ok()
        .or_else(|| serde_json::from_str(&strip_trailing_commas(text)).ok())
}

fn strip_trailing_commas(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    let mut in_string = false;
    let mut escaped = false;

    while i < chars.len() {
        let ch = chars[i];
        if in_string {
            out.push(ch);
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }

        if ch == '"' {
            in_string = true;
            out.push(ch);
            i += 1;
            continue;
        }

        if ch == ',' {
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            if j < chars.len() && matches!(chars[j], '}' | ']') {
                i += 1;
                continue;
            }
        }

        out.push(ch);
        i += 1;
    }

    out
}

fn string_field(primary: &Value, fallback: &Value, key: &str) -> Option<String> {
    primary
        .get(key)
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| {
            fallback
                .get(key)
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
}

fn string_list(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn plugin_links(value: &Value) -> Vec<PluginLink> {
    value
        .get("links")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(PluginLink {
                        label: item.get("label")?.as_str()?.to_string(),
                        url: item.get("url")?.as_str()?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn plugin_actions(value: &Value) -> Vec<PluginAction> {
    value
        .get("actions")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(PluginAction {
                        label: item.get("label")?.as_str()?.to_string(),
                        kind: item.get("kind")?.as_str()?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn plugin_launcher(plugin_json: &Value, manifest_json: &Value) -> PluginLauncher {
    let launcher_json = plugin_json
        .get("launcher")
        .filter(|value| value.is_object())
        .or_else(|| {
            manifest_json
                .get("launcher")
                .filter(|value| value.is_object())
        });

    PluginLauncher {
        views: launcher_json
            .and_then(|value| value.get("views"))
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToString::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        show_in_launcher: launcher_json
            .and_then(|value| value.get("show_in_launcher"))
            .and_then(Value::as_bool)
            .unwrap_or(true),
        requires_selected_file: launcher_json
            .and_then(|value| value.get("requires_selected_file"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        open_mode: launcher_json
            .and_then(|value| value.get("open_mode"))
            .and_then(Value::as_str)
            .unwrap_or("tab")
            .to_string(),
    }
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

fn runtime_binary_name(base: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        format!("{base}.exe")
    }

    #[cfg(not(target_os = "windows"))]
    {
        base.to_string()
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let tray_state = build_hub_tray(&app.handle()).map_err(io::Error::other)?;
            app.manage(tray_state);
            refresh_hub_tray(&app.handle()).map_err(io::Error::other)?;
            spawn_tray_status_worker(app.handle().clone());
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_OPEN_HUB => {
                let _ = show_hub_window(app);
            }
            TRAY_STOP_HUB => {
                let _ = hide_hub_window(app);
            }
            TRAY_RESTART_HUB => {
                let _ = restart_hub_app(app);
            }
            TRAY_OPEN_MISTY => {
                let _ = open_misty_app();
                let _ = refresh_hub_tray(app);
            }
            TRAY_STOP_MISTY => {
                let _ = stop_named_processes(&["misty"]);
                let _ = refresh_hub_tray(app);
            }
            TRAY_RESTART_MISTY => {
                let _ = stop_named_processes(&["misty"]);
                let _ = open_misty_app();
                let _ = refresh_hub_tray(app);
            }
            TRAY_STOP_SERVICES => {
                let _ = stop_services_processes();
                let _ = refresh_hub_tray(app);
            }
            TRAY_RESTART_SERVICES => {
                let _ = stop_services_processes();
                let _ = launch_services_only();
                let _ = refresh_hub_tray(app);
            }
            TRAY_QUIT_ALL => {
                let _ = stop_named_processes(&["misty", "misty-proxy"]);
                app.exit(0);
            }
            _ => {}
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = hide_hub_window(&window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            check_system,
            ensure_misty_folders,
            get_misty_process_status,
            install_misty,
            install_plugin_bundle,
            launch_misty,
            open_external_url,
            probe_paths,
            stop_misty,
            restart_misty,
            scan_local_plugins,
            save_authenticated_user,
            set_plugin_enabled,
            sign_out_misty,
            uninstall_plugin
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
        let path = std::env::temp_dir().join(format!("misty-hub-test-{unique}"));
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

        assert_eq!(
            fs::read(home.join(".local/bin/misty")).unwrap(),
            b"misty-bin"
        );
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
