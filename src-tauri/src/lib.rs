use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::{process::CommandChild, ShellExt};

mod local_db;

// SQLite file for the desktop "Local" storage mode (see src/api/localEntities.js
// + src/api/dataClient.js). Lives in the app's own data dir, not the repo.
const LOCAL_DB_URL: &str = "sqlite:etq-local.db";

// Holds the Python translation sidecar's child process handle so it can be
// killed when the app exits (see the top-level match on RunEvent below).
struct SidecarState(Mutex<Option<CommandChild>>);

// Spawns the NMT/pronoun-QA sidecar (CTranslate2 int8 translation models +
// numpy speaker classifier — see tools/nmt/server.py). Rust doesn't run a
// translation model itself, so this process does the actual inference and
// src/lib/nmtTranslate.js / src/lib/speakerClf.js just call it over
// localhost. Two very different code paths depending on build kind:
//
//  - `tauri dev` (debug_assertions): runs tools/nmt/.venv's python directly
//    against the source tree, exactly as every earlier session's dev/test
//    loop already relied on — untouched, so nothing about local iteration
//    changes.
//  - Release/bundled build: runs the PyInstaller-frozen standalone binary
//    (tools/nmt/server.py frozen via `pyinstaller --onefile`, shipped as a
//    Tauri externalBin sidecar — see tauri.conf.json's `bundle.externalBin`)
//    against the model files shipped as Tauri `bundle.resources`
//    (resources/ct2_models, resources/pronoun_clf → resolved at runtime via
//    Tauri's resource_dir(), passed to the sidecar as env vars the same
//    server.py already reads in dev mode).
fn spawn_nmt_sidecar(app: &tauri::App) {
    if cfg!(debug_assertions) {
        spawn_nmt_sidecar_dev(app);
    } else {
        spawn_nmt_sidecar_release(app);
    }
}

fn spawn_nmt_sidecar_dev(app: &tauri::App) {
    let Ok(cwd) = std::env::current_dir() else {
        log::error!("nmt sidecar: could not resolve current_dir");
        return;
    };
    let nmt_dir = cwd.join("../tools/nmt");
    let python_bin = nmt_dir.join(".venv/bin/python3");
    if !python_bin.exists() {
        log::warn!(
            "nmt sidecar: {:?} not found — 'Dịch AI' will show a connection error until tools/nmt/.venv is set up",
            python_bin
        );
        return;
    }

    let result = app
        .shell()
        .command(python_bin)
        .args(["-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8787"])
        .current_dir(nmt_dir)
        .spawn();
    handle_sidecar_spawn(app, result);
}

fn spawn_nmt_sidecar_release(app: &tauri::App) {
    let resource_dir = match app.path().resource_dir() {
        Ok(dir) => dir,
        Err(e) => {
            log::error!("nmt sidecar: could not resolve resource_dir: {e}");
            return;
        }
    };
    let models_dir = resource_dir.join("nmt/ct2_models");
    let pronoun_clf_dir = resource_dir.join("nmt/pronoun_clf");
    if !models_dir.exists() {
        log::error!("nmt sidecar: {:?} not found — was it bundled? (tauri.conf.json bundle.resources)", models_dir);
        return;
    }

    let result = app.shell().sidecar("nmt-server").and_then(|cmd| {
        cmd.env("NMT_MODELS_DIR", models_dir.as_os_str())
            .env("NMT_PRONOUN_CLF_DIR", pronoun_clf_dir.as_os_str())
            .env("NMT_PORT", "8787")
            .spawn()
    });
    handle_sidecar_spawn(app, result);
}

fn handle_sidecar_spawn(
    app: &tauri::App,
    result: Result<
        (
            tauri::async_runtime::Receiver<tauri_plugin_shell::process::CommandEvent>,
            CommandChild,
        ),
        tauri_plugin_shell::Error,
    >,
) {
    let (mut rx, child) = match result {
        Ok(pair) => pair,
        Err(e) => {
            log::error!("nmt sidecar: failed to spawn: {e}");
            return;
        }
    };

    app.state::<SidecarState>().0.lock().unwrap().replace(child);

    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => log::info!("[nmt] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Stderr(line) => log::info!("[nmt] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Error(e) => log::error!("[nmt] {e}"),
                CommandEvent::Terminated(payload) => {
                    log::warn!("[nmt] sidecar exited: {:?}", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(LOCAL_DB_URL, local_db::migrations())
                .build(),
        )
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            spawn_nmt_sidecar(app);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(child) = app_handle.state::<SidecarState>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
