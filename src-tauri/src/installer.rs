//! Installer tidy-up on macOS (first launch).
//!
//! - Launched from the disk image (directly, or translocated by Gatekeeper):
//!   offer to move the app to /Applications, then relaunch from there.
//! - First launch from anywhere else: eject the still-mounted disk image
//!   (which also closes its Finder window), remembering which file it was
//!   mounted from, and once setup is done, offer to move that file to the Bin.
//!
//! Never list or stat `~/Downloads` (or Desktop/Documents): macOS guards them
//! with a privacy prompt ("would like to access files in your Downloads
//! folder"), which looks suspicious from a dictation app. The image's path
//! comes from `hdiutil info`, and the file is only touched after the user
//! says "Move to Bin".
//!
//! Each question is asked once; the answers live in `installer.json`.

use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_store::StoreExt;

use crate::tray_i18n::{get_tray_translations, TrayStrings};

const STORE_PATH: &str = "installer.json";
/// The disk image was ejected (or there was none) on a first launch.
const EJECTED: &str = "ejected";
/// The Bin question was asked (whatever the answer).
const TRASH_ASKED: &str = "trash_asked";
/// "Not now" to moving out of the disk image.
const MOVE_DECLINED: &str = "move_declined";
/// The disk image files we ejected on the first launch (paths, as `hdiutil`
/// reported them), for the Bin question.
const IMAGE_FILES: &str = "image_files";

fn flag(app: &AppHandle, key: &str) -> bool {
    app.store(crate::portable::store_path(STORE_PATH))
        .ok()
        .and_then(|s| s.get(key))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

fn set_flag(app: &AppHandle, key: &str) {
    match app.store(crate::portable::store_path(STORE_PATH)) {
        Ok(store) => {
            store.set(key, true);
            if let Err(e) = store.save() {
                log::warn!("installer: couldn't save {key}: {e}");
            }
        }
        Err(e) => log::warn!("installer: couldn't open the store: {e}"),
    }
}

fn strings(app: &AppHandle) -> TrayStrings {
    get_tray_translations(Some(crate::settings::get_settings(app).app_language))
}

/// The running `.app` bundle.
fn running_bundle() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    exe.ancestors()
        .find(|p| p.extension().is_some_and(|e| e == "app"))
        .map(Path::to_path_buf)
}

/// One attached disk image from `hdiutil info`: the file it was mounted
/// from (if reported) and its mount points.
#[derive(Debug, Default, PartialEq)]
struct AttachedImage {
    file: Option<PathBuf>,
    mount_points: Vec<PathBuf>,
}

/// Parse `hdiutil info`: images are separated by a line of `=`, each with an
/// `image-path : …` line and device lines ending in `/Volumes/…`.
fn parse_hdiutil_info(text: &str) -> Vec<AttachedImage> {
    let mut images = Vec::new();
    let mut current: Option<AttachedImage> = None;
    for line in text.lines() {
        if line.starts_with("====") {
            images.extend(current.take());
            current = Some(AttachedImage::default());
            continue;
        }
        let Some(image) = current.as_mut() else {
            continue;
        };
        if let Some(rest) = line.strip_prefix("image-path") {
            if let Some((_, path)) = rest.split_once(':') {
                let path = path.trim();
                if !path.is_empty() {
                    image.file = Some(PathBuf::from(path));
                }
            }
        } else if let Some(i) = line.find("/Volumes/") {
            image.mount_points.push(PathBuf::from(line[i..].trim_end()));
        }
    }
    images.extend(current);
    images
}

fn attached_images() -> Vec<AttachedImage> {
    let Ok(out) = Command::new("/usr/bin/hdiutil").arg("info").output() else {
        return Vec::new();
    };
    parse_hdiutil_info(&String::from_utf8_lossy(&out.stdout))
}

/// Whether a mount point is one of our installer volumes: named after the
/// brand and holding `<Brand>.app`.
fn is_our_volume(mp: &Path) -> bool {
    let brand = env!("BRAND_NAME");
    mp.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.starts_with(brand))
        && mp.join(format!("{brand}.app")).is_dir()
}

/// Our own installer images that are attached, with their mount points
/// narrowed to our volumes.
fn our_attached_images() -> Vec<AttachedImage> {
    attached_images()
        .into_iter()
        .filter_map(|mut image| {
            image.mount_points.retain(|mp| is_our_volume(mp));
            (!image.mount_points.is_empty()).then_some(image)
        })
        .collect()
}

/// Mount points of our installer images.
fn our_mounted_images() -> Vec<PathBuf> {
    our_attached_images()
        .into_iter()
        .flat_map(|image| image.mount_points)
        .collect()
}

/// The image files remembered on the first launch.
fn remembered_image_files(app: &AppHandle) -> Vec<PathBuf> {
    app.store(crate::portable::store_path(STORE_PATH))
        .ok()
        .and_then(|s| s.get(IMAGE_FILES))
        .and_then(|v| serde_json::from_value::<Vec<String>>(v).ok())
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .collect()
}

fn remember_image_files(app: &AppHandle, files: &[PathBuf]) {
    let files: Vec<String> = files
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    match app.store(crate::portable::store_path(STORE_PATH)) {
        Ok(store) => {
            store.set(IMAGE_FILES, serde_json::json!(files));
            if let Err(e) = store.save() {
                log::warn!("installer: couldn't save the image path: {e}");
            }
        }
        Err(e) => log::warn!("installer: couldn't open the store: {e}"),
    }
}

/// Only offer to bin a file that is plainly our installer: a `.dmg` named
/// `<Brand>_…`.
fn is_our_installer_file(path: &Path, brand: &str) -> bool {
    path.extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("dmg"))
        && path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.starts_with(&format!("{brand}_")))
}

fn eject(mount_point: &Path) {
    match Command::new("/usr/bin/hdiutil")
        .arg("detach")
        .arg(mount_point)
        .arg("-quiet")
        .status()
    {
        Ok(s) if s.success() => log::info!("installer: ejected {}", mount_point.display()),
        Ok(s) => log::warn!("installer: couldn't eject {} ({s})", mount_point.display()),
        Err(e) => log::warn!("installer: hdiutil failed: {e}"),
    }
}

/// Where the running copy came from, if that is one of our disk images:
/// the bundle path on the image. Running straight off `/Volumes/…`, or from
/// Gatekeeper's translocated mirror of it while our image is mounted.
fn launched_from_image() -> Option<PathBuf> {
    let bundle = running_bundle()?;
    let name = bundle.file_name()?.to_owned();
    if bundle.starts_with("/Volumes/") {
        return Some(bundle);
    }
    if bundle.to_string_lossy().contains("/AppTranslocation/") {
        return our_mounted_images()
            .into_iter()
            .map(|mp| mp.join(&name))
            .find(|p| p.is_dir());
    }
    None
}

/// Move a file to the Bin (NSFileManager, so "Put Back" works).
fn trash(path: &Path) -> Result<(), String> {
    use objc2_foundation::{NSFileManager, NSString, NSURL};
    let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
    NSFileManager::defaultManager()
        .trashItemAtURL_resultingItemURL_error(&url, None)
        .map_err(|e| e.localizedDescription().to_string())
}

/// Called from setup. Returns true when it has taken over showing the first
/// window (the "Move to Applications" question is up); the caller then
/// shows nothing, and [`crate::show_first_window`] runs if the user declines.
pub fn on_launch(app: &AppHandle) -> bool {
    if let Some(source) = launched_from_image() {
        if flag(app, MOVE_DECLINED) {
            return false;
        }
        ask_move_to_applications(app, source);
        return true;
    }
    if !flag(app, EJECTED) {
        set_flag(app, EJECTED);
        let handle = app.clone();
        std::thread::spawn(move || {
            let images = our_attached_images();
            let brand = env!("BRAND_NAME");
            let files: Vec<PathBuf> = images
                .iter()
                .filter_map(|image| image.file.clone())
                .filter(|f| is_our_installer_file(f, brand))
                .collect();
            if !files.is_empty() {
                remember_image_files(&handle, &files);
            }
            for mp in images.iter().flat_map(|image| &image.mount_points) {
                eject(mp);
            }
        });
    }
    false
}

fn ask_move_to_applications(app: &AppHandle, source: PathBuf) {
    let s = strings(app);
    let handle = app.clone();
    app.dialog()
        .message(s.move_to_apps_body.clone())
        .title(s.move_to_apps_title.clone())
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            s.move_to_apps_confirm.clone(),
            s.move_to_apps_later.clone(),
        ))
        .show(move |yes| {
            if !yes {
                set_flag(&handle, MOVE_DECLINED);
                let h = handle.clone();
                let _ = handle.run_on_main_thread(move || crate::show_first_window(&h));
                return;
            }
            match move_to_applications(&source) {
                Ok(dest) => relaunch_from(&handle, &dest),
                Err(e) => {
                    log::error!("installer: move to Applications failed: {e}");
                    let s = strings(&handle);
                    let h = handle.clone();
                    handle
                        .dialog()
                        .message(s.move_to_apps_failed)
                        .kind(MessageDialogKind::Warning)
                        .buttons(MessageDialogButtons::Ok)
                        .show(move |_| {
                            let hh = h.clone();
                            let _ = h.run_on_main_thread(move || crate::show_first_window(&hh));
                        });
                }
            }
        });
}

/// Copy the bundle to /Applications (an older copy there goes to the Bin
/// first), keeping its signature and attributes.
fn move_to_applications(source: &Path) -> Result<PathBuf, String> {
    let name = source.file_name().ok_or("no bundle name")?;
    let dest = Path::new("/Applications").join(name);
    if dest.exists() {
        trash(&dest).map_err(|e| format!("couldn't move the old copy to the Bin: {e}"))?;
    }
    let status = Command::new("/usr/bin/ditto")
        .arg(source)
        .arg(&dest)
        .status()
        .map_err(|e| format!("ditto: {e}"))?;
    if !status.success() {
        return Err(format!("ditto exited with {status}"));
    }
    log::info!(
        "installer: copied {} to {}",
        source.display(),
        dest.display()
    );
    Ok(dest)
}

/// Quit, then open the copy in /Applications once this process is gone (a
/// second instance would only hand its arguments to this one). That copy's
/// first launch ejects the disk image.
fn relaunch_from(app: &AppHandle, dest: &Path) {
    let pid = std::process::id().to_string();
    let spawned = Command::new("/bin/sh")
        .arg("-c")
        .arg(r#"while /bin/kill -0 "$1" 2>/dev/null; do /bin/sleep 0.2; done; /usr/bin/open "$2""#)
        .arg("sh")
        .arg(&pid)
        .arg(dest)
        .spawn();
    match spawned {
        Ok(_) => {
            log::info!("installer: relaunching from {}", dest.display());
            app.exit(0);
        }
        Err(e) => {
            log::error!("installer: couldn't relaunch: {e}");
            crate::show_first_window(app);
        }
    }
}

/// Setup is done: offer once to put the downloaded installer in the Bin.
/// Only the image file we were installed from (remembered when it was
/// ejected) is offered, and nothing in the user's folders is read, listed or
/// even checked for existence until they say yes: those folders are behind a
/// macOS privacy prompt.
pub fn offer_trash_installer(app: &AppHandle) {
    if flag(app, TRASH_ASKED) || launched_from_image().is_some() {
        return;
    }
    let dmgs = remembered_image_files(app);
    if dmgs.is_empty() {
        return;
    }
    let prefix = format!("{}_", env!("BRAND_NAME"));
    set_flag(app, TRASH_ASKED);

    let s = strings(app);
    let file = if dmgs.len() == 1 {
        dmgs[0]
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    } else {
        format!("{prefix}….dmg")
    };
    let images = our_mounted_images();
    app.dialog()
        .message(s.installer_trash_body.replace("{{file}}", &file))
        .title(s.installer_trash_title.clone())
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            s.installer_trash_confirm.clone(),
            s.installer_keep.clone(),
        ))
        .show(move |yes| {
            if !yes {
                log::info!("installer: keeping the installer");
                return;
            }
            // A still-mounted image can't go to the Bin cleanly.
            for mp in &images {
                eject(mp);
            }
            for dmg in &dmgs {
                match trash(dmg) {
                    Ok(()) => log::info!("installer: moved {} to the Bin", dmg.display()),
                    Err(e) => log::warn!("installer: couldn't trash {}: {e}", dmg.display()),
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    const INFO: &str = "framework       : 671.140.2
driver          : 10.15v671.140.2
================================================
image-path      : /Users/sam/Downloads/Ambient_0.1.11_aarch64.dmg
image-alias     : /Users/sam/Downloads/Ambient_0.1.11_aarch64.dmg
shadow-path     : <none>
image-type      : read-only disk image
/dev/disk4\tGUID_partition_scheme\t
/dev/disk4s1\tApple_HFS\t/Volumes/Ambient
================================================
image-path      : /Users/sam/Desktop/Other Thing.dmg
/dev/disk5\tFDisk_partition_scheme\t
/dev/disk5s1\tApple_HFS\t/Volumes/Other Thing 1
";

    #[test]
    fn hdiutil_info_gives_each_image_file_and_its_volumes() {
        let images = parse_hdiutil_info(INFO);
        assert_eq!(
            images,
            vec![
                AttachedImage {
                    file: Some(PathBuf::from(
                        "/Users/sam/Downloads/Ambient_0.1.11_aarch64.dmg"
                    )),
                    mount_points: vec![PathBuf::from("/Volumes/Ambient")],
                },
                AttachedImage {
                    file: Some(PathBuf::from("/Users/sam/Desktop/Other Thing.dmg")),
                    mount_points: vec![PathBuf::from("/Volumes/Other Thing 1")],
                },
            ]
        );
        assert!(parse_hdiutil_info("framework : 1\n").is_empty());
    }

    #[test]
    fn only_our_named_installer_is_offered_for_the_bin() {
        let ok = Path::new("/Users/sam/Downloads/Ambient_0.1.11_aarch64.dmg");
        assert!(is_our_installer_file(ok, "Ambient"));
        assert!(!is_our_installer_file(
            Path::new("/Users/sam/Downloads/Other.dmg"),
            "Ambient"
        ));
        assert!(!is_our_installer_file(
            Path::new("/Users/sam/Downloads/Ambient_notes.pdf"),
            "Ambient"
        ));
    }
}
