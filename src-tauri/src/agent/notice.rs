//! "Never a silent nothing": what the agent did, or why it couldn't and what
//! it can do instead, as one HUD notice with buttons.
//!
//! The buttons carry everything they need in their `value`, so nothing is
//! kept here between showing a notice and the user pressing one.

use std::collections::BTreeMap;

use tauri::AppHandle;

use super::router::Action;
use crate::hud::{self, HudContent, HudOffer, HudTone};

/// HUD ids of notices; their buttons come back to `on_action`.
pub const PREFIX: &str = "notice-";

/// Offer actions understood by `on_action`.
pub mod offer {
    /// Run an `Action` (JSON in the value): "add it to your calendar instead".
    pub const ACT: &str = "act";
    /// Answer the value as a question, with the web.
    pub const ANSWER: &str = "answer";
    /// Ask the agent the value, as if said with the Ask shortcut.
    pub const ASK: &str = "ask";
    /// Open a system settings pane by name ("reminders", "calendars").
    pub const SETTINGS: &str = "settings";
    /// Open a file or folder (the value is a path).
    pub const OPEN_FILE: &str = "open_file";
    /// Copy the value (handled by the HUD itself).
    pub const COPY: &str = "copy";
    /// Open the pricing page to upgrade (a Free limit was reached).
    pub const UPGRADE: &str = "upgrade";
    /// Remember a word fix (`corrections`; the value is the pair as JSON).
    pub const LEARN_WORD: &str = "learn_word";
    /// Never offer that word fix again.
    pub const LEARN_SKIP: &str = "learn_skip";
}

/// A notice, built up and then shown.
pub struct Notice {
    key: String,
    vars: BTreeMap<String, String>,
    tone: HudTone,
    undo: bool,
    offers: Vec<HudOffer>,
}

impl Notice {
    pub fn new(key: &str, tone: HudTone) -> Self {
        Self {
            key: key.into(),
            vars: BTreeMap::new(),
            tone,
            undo: false,
            offers: Vec::new(),
        }
    }

    /// Something done: green, with Undo when it can be taken back.
    pub fn done(key: &str) -> Self {
        Self::new(key, HudTone::Success)
    }

    /// Couldn't do it: said plainly, never red unless it's an error.
    pub fn cant(key: &str) -> Self {
        Self::new(key, HudTone::Neutral)
    }

    pub fn var(mut self, name: &str, value: impl Into<String>) -> Self {
        self.vars.insert(name.into(), value.into());
        self
    }

    pub fn undo(mut self, undo: bool) -> Self {
        self.undo = undo;
        self
    }

    pub fn offer(mut self, action: &str, label: &str, value: impl Into<String>) -> Self {
        self.offers
            .push(HudOffer::new(action, label, Some(value.into())));
        self
    }

    /// "Add it to your calendar instead" for an action.
    pub fn offer_action(self, label: &str, action: &Action) -> Self {
        match serde_json::to_string(action) {
            Ok(json) => self.offer(offer::ACT, label, json),
            Err(_) => self,
        }
    }

    #[cfg(test)]
    pub fn offers(&self) -> &[HudOffer] {
        &self.offers
    }

    /// For telemetry: `ok` when done; `fallback` when it was done another
    /// way (an .ics file) or an alternative was offered; `failed` otherwise.
    pub fn outcome(&self) -> &'static str {
        let other_way = [
            "Ics",
            "noCalendarApp",
            "reminderLinux",
            "reminderWindows",
            "NotificationsOff",
        ]
        .iter()
        .any(|k| self.key.contains(k));
        match self.tone {
            _ if other_way => "fallback",
            HudTone::Success => "ok",
            _ if !self.offers.is_empty() => "fallback",
            _ => "failed",
        }
    }

    pub fn content(self) -> HudContent {
        HudContent::Notice {
            id: format!("{PREFIX}{}", chrono::Utc::now().timestamp_millis()),
            text: self.key,
            vars: self.vars,
            tone: self.tone,
            undo: self.undo,
            offers: self.offers,
        }
    }

    pub fn show(self, app: &AppHandle) {
        log::debug!(
            "agent: notice {} ({} offers, undo={})",
            self.key,
            self.offers.len(),
            self.undo
        );
        hud::show(app, self.content());
    }
}

/// A button on a notice was pressed.
pub fn on_action(app: &AppHandle, _id: &str, action: &str, value: Option<String>) {
    let value = value.unwrap_or_default();
    match action {
        offer::ACT => match serde_json::from_str::<Action>(&value) {
            Ok(a) => {
                hud::show(
                    app,
                    HudContent::Listening {
                        heard: String::new(),
                    },
                );
                let app = app.clone();
                tauri::async_runtime::spawn(async move { super::act::run(app, a).await });
            }
            Err(e) => log::warn!("notice: bad action payload: {e}"),
        },
        offer::ANSWER => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                super::answer::run(app, value, true, false, None).await
            });
        }
        offer::ASK => {
            hud::hide(app);
            super::ask_instead(app, value);
        }
        offer::SETTINGS => {
            hud::hide(app);
            open_settings(app, &value);
        }
        offer::UPGRADE => {
            hud::hide(app);
            use tauri_plugin_opener::OpenerExt;
            let url = crate::plan::upgrade_url(app.clone());
            if let Err(e) = app.opener().open_url(url, None::<&str>) {
                log::warn!("notice: couldn't open the pricing page: {e}");
            }
        }
        offer::LEARN_WORD => {
            hud::hide(app);
            crate::corrections::accept(app, &value);
        }
        offer::LEARN_SKIP => crate::corrections::decline(app, &value),
        offer::OPEN_FILE => {
            hud::hide(app);
            use tauri_plugin_opener::OpenerExt;
            if let Err(e) = app.opener().open_path(&value, None::<&str>) {
                log::warn!("notice: couldn't open the file: {e}");
            }
        }
        "undo" => {
            let ok = super::act::undo_last();
            Notice::new(
                if ok {
                    "hud.status.undone"
                } else {
                    "hud.notice.undoFailed"
                },
                if ok { HudTone::Neutral } else { HudTone::Error },
            )
            .show(app);
        }
        other => log::debug!("notice: unhandled action {other}"),
    }
}

/// The system's privacy pane for Reminders or Calendars.
fn open_settings(app: &AppHandle, pane: &str) {
    use tauri_plugin_opener::OpenerExt;
    let Some(url) = settings_url(pane) else {
        return;
    };
    if let Err(e) = app.opener().open_url(url, None::<&str>) {
        log::warn!("notice: couldn't open settings: {e}");
    }
}

fn settings_url(pane: &str) -> Option<&'static str> {
    if cfg!(target_os = "macos") {
        Some(match pane {
            "calendars" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars"
            }
            _ => "x-apple.systempreferences:com.apple.preference.security?Privacy_Reminders",
        })
    } else if cfg!(target_os = "windows") {
        Some("ms-settings:notifications")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notices_carry_their_alternatives() {
        let a = Action::CalendarEvent {
            title: "fix the vault".into(),
            start: "2026-11-03T09:00".into(),
            end: None,
            location: None,
        };
        let n = Notice::cant("hud.notice.reminderLinux")
            .var("title", "fix the vault")
            .offer_action("hud.offer.addToCalendar", &a)
            .offer(offer::COPY, "hud.copy", "fix the vault");
        assert_eq!(n.offers().len(), 2);
        let back: Action =
            serde_json::from_str(n.offers()[0].value.as_deref().unwrap()).expect("action");
        assert_eq!(back, a);
        match n.content() {
            HudContent::Notice { id, text, vars, .. } => {
                assert!(id.starts_with(PREFIX));
                assert_eq!(text, "hud.notice.reminderLinux");
                assert_eq!(vars.get("title").map(String::as_str), Some("fix the vault"));
            }
            _ => panic!("not a notice"),
        }
    }
}
