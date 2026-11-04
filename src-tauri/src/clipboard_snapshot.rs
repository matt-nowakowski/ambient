//! The user's clipboard, saved before a paste and put back after it with
//! every format kept: rich text, copied files, images, app data (a copied
//! spreadsheet range, a design layer). macOS and Windows; elsewhere the
//! caller falls back to text or an image.
//!
//! Saved in memory only, for the second or so a paste takes.

/// Above this the clipboard is too big to copy for one paste; the caller
/// falls back to text or an image.
#[cfg_attr(not(any(target_os = "macos", target_os = "windows")), allow(dead_code))]
const MAX_TOTAL_BYTES: usize = 64 * 1024 * 1024;

/// Whether `sizes` (bytes per saved format) are small enough to keep.
#[cfg_attr(not(any(target_os = "macos", target_os = "windows")), allow(dead_code))]
fn within_budget(sizes: impl IntoIterator<Item = usize>) -> bool {
    let mut total = 0usize;
    for size in sizes {
        total = total.saturating_add(size);
        if total > MAX_TOTAL_BYTES {
            return false;
        }
    }
    true
}

/// Everything on the clipboard. `None` from `capture` means it couldn't be
/// read whole (or is empty, or too big): fall back.
pub struct ClipboardSnapshot {
    #[cfg(target_os = "macos")]
    items: Vec<Vec<(String, Vec<u8>)>>,
    #[cfg(target_os = "windows")]
    formats: Vec<(u32, Vec<u8>)>,
}

#[cfg(target_os = "macos")]
impl ClipboardSnapshot {
    pub fn capture() -> Option<Self> {
        use objc2_app_kit::NSPasteboard;

        let pasteboard = NSPasteboard::generalPasteboard();
        let mut items = Vec::new();
        for item in pasteboard.pasteboardItems()?.iter() {
            let mut saved = Vec::new();
            for kind in item.types().iter() {
                // A promise whose owner is gone (or refused) has no data.
                if let Some(data) = item.dataForType(&kind) {
                    saved.push((kind.to_string(), data.to_vec()));
                }
            }
            if !saved.is_empty() {
                items.push(saved);
            }
        }
        if items.is_empty() || !within_budget(items.iter().flatten().map(|(_, data)| data.len())) {
            return None;
        }
        Some(Self { items })
    }

    /// Puts it all back. False if the pasteboard refused it.
    pub fn restore(&self) -> bool {
        use objc2::runtime::ProtocolObject;
        use objc2_app_kit::{NSPasteboard, NSPasteboardItem, NSPasteboardWriting};
        use objc2_foundation::{NSArray, NSData, NSString};

        let objects: Vec<_> = self
            .items
            .iter()
            .map(|saved| {
                let item = NSPasteboardItem::new();
                for (kind, data) in saved {
                    item.setData_forType(&NSData::with_bytes(data), &NSString::from_str(kind));
                }
                ProtocolObject::<dyn NSPasteboardWriting>::from_retained(item)
            })
            .collect();
        let pasteboard = NSPasteboard::generalPasteboard();
        pasteboard.clearContents();
        pasteboard.writeObjects(&NSArray::from_retained_slice(&objects))
    }
}

#[cfg(target_os = "windows")]
impl ClipboardSnapshot {
    pub fn capture() -> Option<Self> {
        use windows::Win32::Foundation::HGLOBAL;
        use windows::Win32::System::DataExchange::{
            CloseClipboard, EnumClipboardFormats, GetClipboardData,
        };
        use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

        if !open_clipboard() {
            return None;
        }
        let mut formats = Vec::new();
        let mut format = 0u32;
        loop {
            format = unsafe { EnumClipboardFormats(format) };
            if format == 0 {
                break;
            }
            if !is_global_memory_format(format) {
                continue;
            }
            let Ok(handle) = (unsafe { GetClipboardData(format) }) else {
                continue;
            };
            let hg = HGLOBAL(handle.0);
            let size = unsafe { GlobalSize(hg) };
            if size == 0 || size > MAX_TOTAL_BYTES {
                continue;
            }
            let ptr = unsafe { GlobalLock(hg) } as *const u8;
            if ptr.is_null() {
                continue;
            }
            let data = unsafe { std::slice::from_raw_parts(ptr, size) }.to_vec();
            let _ = unsafe { GlobalUnlock(hg) };
            formats.push((format, data));
        }
        let _ = unsafe { CloseClipboard() };
        if formats.is_empty() || !within_budget(formats.iter().map(|(_, data)| data.len())) {
            return None;
        }
        Some(Self { formats })
    }

    /// Puts it all back. False if the clipboard couldn't be opened.
    pub fn restore(&self) -> bool {
        use windows::Win32::Foundation::{GlobalFree, HANDLE};
        use windows::Win32::System::DataExchange::{
            CloseClipboard, EmptyClipboard, SetClipboardData,
        };
        use windows::Win32::System::Memory::{
            GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE,
        };

        if !open_clipboard() {
            return false;
        }
        unsafe {
            let _ = EmptyClipboard();
            for (format, data) in &self.formats {
                let Ok(hg) = GlobalAlloc(GMEM_MOVEABLE, data.len()) else {
                    continue;
                };
                let ptr = GlobalLock(hg) as *mut u8;
                if ptr.is_null() {
                    let _ = GlobalFree(Some(hg));
                    continue;
                }
                std::ptr::copy_nonoverlapping(data.as_ptr(), ptr, data.len());
                let _ = GlobalUnlock(hg);
                // The clipboard owns the memory once this succeeds.
                if SetClipboardData(*format, Some(HANDLE(hg.0))).is_err() {
                    let _ = GlobalFree(Some(hg));
                }
            }
            let _ = CloseClipboard();
        }
        true
    }
}

/// Another app may hold the clipboard for a moment; try a few times.
#[cfg(target_os = "windows")]
fn open_clipboard() -> bool {
    use windows::Win32::System::DataExchange::OpenClipboard;
    for _ in 0..5 {
        if unsafe { OpenClipboard(None) }.is_ok() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    log::warn!("couldn't open the clipboard");
    false
}

/// Formats whose data is plain global memory, so it can be copied as bytes.
/// GDI handles (bitmaps, metafiles, palettes), owner-drawn display formats
/// and the private and GDI-object ranges are not; a bitmap is still kept
/// through the CF_DIB Windows offers alongside it.
#[cfg(target_os = "windows")]
fn is_global_memory_format(format: u32) -> bool {
    use windows::Win32::System::Ole::{
        CF_BITMAP, CF_DSPBITMAP, CF_DSPENHMETAFILE, CF_DSPMETAFILEPICT, CF_DSPTEXT, CF_ENHMETAFILE,
        CF_METAFILEPICT, CF_OWNERDISPLAY, CF_PALETTE,
    };
    const PRIVATE_AND_GDI_OBJECTS: std::ops::RangeInclusive<u32> = 0x0200..=0x03FF;
    let handles = [
        CF_BITMAP,
        CF_METAFILEPICT,
        CF_ENHMETAFILE,
        CF_PALETTE,
        CF_OWNERDISPLAY,
        CF_DSPTEXT,
        CF_DSPBITMAP,
        CF_DSPMETAFILEPICT,
        CF_DSPENHMETAFILE,
    ];
    !PRIVATE_AND_GDI_OBJECTS.contains(&format) && !handles.iter().any(|f| f.0 as u32 == format)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
impl ClipboardSnapshot {
    pub fn capture() -> Option<Self> {
        None
    }

    pub fn restore(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn budget_counts_every_format() {
        assert!(within_budget([1, 2, 3]));
        assert!(within_budget([MAX_TOTAL_BYTES]));
        assert!(!within_budget([MAX_TOTAL_BYTES, 1]));
        assert!(!within_budget([usize::MAX, usize::MAX]));
    }
}
