// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::webview::NewWindowResponse;

// The asynchronous picker and write leave the story's UI thread responsive.
// Only the path chosen by the player is written; JS supplies no destination.
#[tauri::command]
async fn export_save(name: String, data: Vec<u8>) -> Result<Option<String>, String> {
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_file_name(name)
        .save_file()
        .await
    else {
        return Ok(None);
    };
    file.write(&data).await.map_err(|error| error.to_string())?;
    Ok(Some(file.path().display().to_string()))
}

#[tauri::command]
async fn export_status(message: String) {
    rfd::AsyncMessageDialog::new()
        .set_title("Save export")
        .set_description(message)
        .show()
        .await;
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![export_save, export_status])
        .setup(|app| {
            let config = app
                .config()
                .app
                .windows
                .first()
                .ok_or("missing story window config")?;
            tauri::WebviewWindowBuilder::from_config(app, config)?
                .initialization_script(include_str!("../../desktop-export.js"))
                .on_new_window(move |url, _features| {
                    // Open web/contact links in the browser without replacing the story.
                    if matches!(url.scheme(), "https" | "http" | "mailto") {
                        if let Err(error) =
                            tauri_plugin_opener::open_url(url.as_str(), None::<&str>)
                        {
                            tauri::async_runtime::spawn(async move {
                                rfd::AsyncMessageDialog::new()
                                    .set_title("Open link")
                                    .set_description(format!("Could not open link: {error}"))
                                    .show()
                                    .await;
                            });
                        }
                    }
                    NewWindowResponse::Deny
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
