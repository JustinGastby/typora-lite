use std::sync::Mutex;

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

struct PendingOpenPaths(Mutex<Vec<String>>);

#[tauri::command]
fn take_pending_open_paths(app: tauri::AppHandle) -> Vec<String> {
    let state = app.state::<PendingOpenPaths>();
    let mut guard = state.0.lock().expect("pending open paths lock");
    std::mem::take(&mut *guard)
}

#[cfg(any(windows, target_os = "linux"))]
fn normalize_open_arg(arg: &str) -> Option<String> {
    if arg.starts_with('-') {
        return None;
    }
    if let Ok(url) = tauri::Url::parse(arg) {
        return url
            .to_file_path()
            .ok()
            .map(|p| p.to_string_lossy().into_owned());
    }
    Some(arg.to_string())
}

fn queue_open_paths(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    {
        let state = app.state::<PendingOpenPaths>();
        let mut guard = state.0.lock().expect("pending open paths lock");
        guard.extend(paths.iter().cloned());
    }
    let _ = app.emit("app-open-paths", paths);
}

fn build_app_menu(app: &tauri::App) -> tauri::Result<()> {
    let new_file = MenuItemBuilder::with_id("menu-new-file", "新建")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open_file = MenuItemBuilder::with_id("menu-open-file", "打开文件…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let open_folder = MenuItemBuilder::with_id("menu-open-folder", "打开文件夹…")
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?;
    let save = MenuItemBuilder::with_id("menu-save", "保存")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let export_html = MenuItemBuilder::with_id("menu-export-html", "导出为 HTML…").build(app)?;
    let export_pdf = MenuItemBuilder::with_id("menu-export-pdf", "导出为 PDF…").build(app)?;
    let toggle_sidebar = MenuItemBuilder::with_id("menu-toggle-sidebar", "切换侧边栏")
        .accelerator("CmdOrCtrl+B")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "文件")
        .item(&new_file)
        .item(&open_file)
        .item(&open_folder)
        .separator()
        .item(&save)
        .separator()
        .item(&export_html)
        .item(&export_pdf)
        .separator()
        .close_window()
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "编辑")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "视图")
        .item(&toggle_sidebar)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "窗口")
        .minimize()
        .maximize()
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&file_menu, &edit_menu, &view_menu, &window_menu])
        .build()?;

    app.set_menu(menu)?;

    app.on_menu_event(move |app_handle, event| {
        let forwarded = match event.id().as_ref() {
            "menu-new-file" => Some("menu-new-file"),
            "menu-open-file" => Some("menu-open-file"),
            "menu-open-folder" => Some("menu-open-folder"),
            "menu-save" => Some("menu-save"),
            "menu-export-html" => Some("menu-export-html"),
            "menu-export-pdf" => Some("menu-export-pdf"),
            "menu-toggle-sidebar" => Some("menu-toggle-sidebar"),
            _ => None,
        };
        if let Some(event_name) = forwarded {
            let _ = app_handle.emit(event_name, ());
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(PendingOpenPaths(Mutex::new(Vec::new())))
        .setup(|app| {
            build_app_menu(app)?;

            // Windows / Linux: files passed as process args when opened from Explorer.
            #[cfg(any(windows, target_os = "linux"))]
            {
                let paths: Vec<String> = std::env::args()
                    .skip(1)
                    .filter_map(|arg| normalize_open_arg(&arg))
                    .collect();
                queue_open_paths(&app.handle(), paths);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![take_pending_open_paths])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(
            #[allow(unused_variables)]
            |app, event| {
                // macOS: dock drop / Finder "Open With" / double-click associations.
                #[cfg(any(target_os = "macos", target_os = "ios"))]
                if let tauri::RunEvent::Opened { urls } = event {
                    let paths = urls
                        .into_iter()
                        .filter_map(|url| url.to_file_path().ok())
                        .map(|p| p.to_string_lossy().into_owned())
                        .collect::<Vec<_>>();
                    queue_open_paths(app, paths);
                }
            },
        );
}
