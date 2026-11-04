//! The ambient agent. `handle` runs what the router decided (answer, act,
//! recall); the background loop watches which app is in front and, when the
//! user has opted in, keeps encrypted screen memory.

pub mod act;
pub mod answer;
pub mod budget;
pub mod compose;
pub mod judge;
#[cfg(any(target_os = "linux", test))]
pub(crate) mod linux;
pub mod llm;
pub mod notice;
pub mod personal;
pub mod proactive;
pub mod reminders;
pub mod report;
pub mod router;
pub mod styles;
pub mod wake;
pub mod when;
pub mod writing;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::managers::history::HistoryManager;
use router::Route;

use crate::context::{self, redact::redact, FrontmostApp};
use crate::settings;

/// How often the loop checks the frontmost app (cheap: no accessibility calls).
const TICK: Duration = Duration::from_secs(1);
/// Re-capture the same app after this long, if its text changed.
const IDLE_RECAPTURE: Duration = Duration::from_secs(30);
/// Wait this long after an app switch so the new window has drawn.
const SETTLE: Duration = Duration::from_millis(1200);
const SNAPSHOT_CHARS: usize = 6000;
/// How long the user stays on a window before a suggestion is considered.
const DWELL: Duration = Duration::from_secs(6);

fn agent_prep_due(last: &mut Option<Instant>) -> bool {
    if last.is_some_and(|t| t.elapsed() < Duration::from_secs(60)) {
        return false;
    }
    *last = Some(Instant::now());
    true
}

fn is_recording(app: &AppHandle) -> bool {
    app.try_state::<Arc<crate::managers::audio::AudioRecordingManager>>()
        .is_some_and(|rm| rm.is_recording())
}

/// The last app the user was in that isn't Ambient itself, so "about this"
/// still works after the user clicks into an Ambient window.
static LAST_USER_APP: Mutex<Option<FrontmostApp>> = Mutex::new(None);

pub fn last_user_app() -> Option<FrontmostApp> {
    LAST_USER_APP.lock().ok().and_then(|g| g.clone())
}

/// Set while the agent tour's "Try it now" is on screen.
static TOUR_TRY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn set_tour_try(on: bool) {
    TOUR_TRY.store(on, std::sync::atomic::Ordering::SeqCst);
}

/// The tour asks the user to try the agent and Ambient's own window is in
/// front. There is no field there to type into, so whatever is said, with
/// either shortcut, is a request: the dictation shortcut would otherwise type
/// it into nothing (or route it as dictation), and the try did nothing.
pub fn trying_from_tour() -> bool {
    TOUR_TRY.load(std::sync::atomic::Ordering::SeqCst)
        && context::frontmost_app().is_some_and(|f| f.bundle_id == env!("BRAND_IDENTIFIER"))
}

/// Apps whose being in front, while another app uses the mic, means a call.
const CALL_APPS: &[&str] = &[
    "us.zoom.xos",
    "com.microsoft.teams2",
    "com.microsoft.teams",
    "com.apple.FaceTime",
    "com.tinyspeck.slackmacgap",
    "com.hnc.Discord",
    "Cisco-Systems.Spark",
    "com.webex.meetingmanager",
    // Windows (executable names).
    "zoom.exe",
    "ms-teams.exe",
    "teams.exe",
    "slack.exe",
    "discord.exe",
    "webex.exe",
    "ciscocollabhost.exe",
    "atmgr.exe",
];
const BROWSERS: &[&str] = &[
    "com.google.Chrome",
    "com.apple.Safari",
    "company.thebrowser.Browser",
    "com.microsoft.edgemac",
    "org.mozilla.firefox",
    "com.brave.Browser",
    // Windows (executable names).
    "chrome.exe",
    "msedge.exe",
    "brave.exe",
    "firefox.exe",
    "arc.exe",
];
/// A browser on any OS (Linux app ids come from the platform's list).
pub(crate) fn is_browser(bundle: &str) -> bool {
    BROWSERS.contains(&bundle) || context::is_platform_browser(bundle)
}
/// Ask at most once per call app in this window.
const OFFER_COOLDOWN: Duration = Duration::from_secs(30 * 60);
pub const MEETING_OFFER_ID: &str = "meeting-offer";

fn is_call(front: &FrontmostApp, never_watch: &[String]) -> bool {
    if CALL_APPS.contains(&front.bundle_id.as_str())
        || context::is_platform_call_app(&front.bundle_id)
    {
        return true;
    }
    if !BROWSERS.contains(&front.bundle_id.as_str())
        && !context::is_platform_browser(&front.bundle_id)
    {
        return false;
    }
    // Browser calls: look at the window's title and URL only (no page text).
    context::snapshot(0, never_watch).is_ok_and(|s| {
        let url = s.url.unwrap_or_default();
        url.contains("meet.google.com")
            || url.contains("teams.microsoft.com")
            || url.contains("teams.live.com")
            || url.contains("zoom.us/wc")
            || s.window_title.starts_with("Meet - ")
            || s.window_title.contains("| Microsoft Teams")
    })
}

/// Accepting the HUD's meeting offer starts notes.
fn listen_for_offer(app: &AppHandle) {
    use tauri::Listener;
    let handle = app.clone();
    app.listen("hud-action", move |event| {
        let Ok(action) = serde_json::from_str::<crate::hud::HudActionEvent>(event.payload()) else {
            return;
        };
        // Click outside a report card or the "report this?" offer.
        if action.id.starts_with(report::CARD_PREFIX) {
            report::on_action(&handle, &action.id, &action.action, None);
            return;
        }
        if action.id.starts_with(CHIP_PREFIX) {
            on_chip_action(&handle, &action.id, &action.action);
            return;
        }
        if action.id.starts_with(crate::meeting::NUDGE_PREFIX) {
            crate::meeting::on_nudge_action(&handle, &action.id, &action.action);
            return;
        }
        if action.id == proactive::CLOUD_OFFER_ID {
            proactive::on_cloud_offer(&handle, &action.action);
            return;
        }
        if action.id.starts_with(proactive::ID_PREFIX) {
            proactive::on_action(&handle, &action.id, &action.action);
            return;
        }
        if action.id == MEETING_OFFER_ID && action.action == "accept" {
            crate::hud::hide(&handle);
            match crate::meeting::start(&handle) {
                Ok(_) => crate::hud::show(
                    &handle,
                    crate::hud::HudContent::Status {
                        text: "hud.status.meetingStarted".into(),
                        tone: crate::hud::HudTone::Success,
                        undo: false,
                    },
                ),
                // Free's meetings this month are used: say so, with Upgrade.
                Err(key) if key == crate::meeting::FREE_LIMIT_ERROR => {
                    crate::limits::show(&handle, crate::limits::Limit::Meetings)
                }
                Err(key) => crate::hud::show(
                    &handle,
                    crate::hud::HudContent::Status {
                        text: key,
                        tone: crate::hud::HudTone::Error,
                        undo: false,
                    },
                ),
            }
        }
    });
}

pub fn start(app: AppHandle) {
    listen_for_offer(&app);
    wake::start(app.clone());
    std::thread::Builder::new()
        .name("ambient-agent".into())
        .spawn(move || run(app))
        .expect("spawn agent loop");
}

fn run(app: AppHandle) {
    let own_id = env!("BRAND_IDENTIFIER");
    let mut current: Option<(i32, Instant)> = None; // pid, when it came to front
    let mut last_capture: Option<Instant> = None;
    let mut offered: std::collections::HashMap<String, Instant> = std::collections::HashMap::new();
    // Proactive suggestions look at each window (app + title) once, after
    // the user has stayed on it for DWELL.
    let mut window: Option<(i32, String, Instant)> = None;
    let mut last_prep: Option<Instant> = None;
    let mut notified_sensitive: Option<String> = None;
    let mut considered: Option<(i32, String)> = None;
    // The last skip reason logged at debug, so it's logged once per window.
    let mut last_skip: Option<String> = None;

    loop {
        std::thread::sleep(TICK);
        let Some(front) = context::frontmost_app() else {
            continue;
        };
        if front.bundle_id != own_id {
            if let Ok(mut g) = LAST_USER_APP.lock() {
                *g = Some(front.clone());
            }
        }

        let switched = current.map_or(true, |(pid, _)| pid != front.pid);
        if switched {
            log::trace!("agent loop: {} came to front", front.bundle_id);
            current = Some((front.pid, Instant::now()));
            last_capture = None;
            continue;
        }
        let (_, since) = current.expect("set above");
        if since.elapsed() < SETTLE {
            continue;
        }

        // Whenever anything watches the screen, the front window's metadata
        // (app, titles, frame URLs; no text) is checked every tick, so a
        // wallet, password manager or bank is noticed the moment it opens
        // (a MetaMask side panel included), not only when a secret shows.
        let agent = settings::get_settings(&app).agent;
        let watching =
            (agent.screen_context || agent.screen_memory || agent.proactive) && !agent.is_paused();
        let meta = if watching {
            context::snapshot(0, &agent.never_watch)
        } else {
            Err(context::Skipped::Unavailable)
        };

        // Stepped back from a private place, or a window showing a recovery
        // phrase or key: say so once per window.
        if let Some(found) = context::recent_sensitive() {
            let key = format!("{}|{}", found.bundle_id, found.title);
            if watching && notified_sensitive.as_deref() != Some(&key) {
                log::debug!(
                    "agent loop: stepped back from {} title[{}] ({:?}); telling the user",
                    found.bundle_id,
                    context::title_tag(&found.title),
                    found.reason
                );
                notified_sensitive = Some(key);
                crate::hud::show(
                    &app,
                    crate::hud::HudContent::Status {
                        text: found.reason.status_key().into(),
                        tone: crate::hud::HudTone::Neutral,
                        undo: false,
                    },
                );
            }
        }

        // Meeting prep from the user's own Calendar, checked once a minute.
        // On Free it's one of the week's suggestions, and the brief an AI use.
        if agent_prep_due(&mut last_prep) {
            let a = settings::get_settings(&app).agent;
            if a.proactive
                && !a.is_paused()
                && !crate::limits::suggestions_done(&app)
                && !crate::hud::is_visible()
            {
                proactive::consider_calendar(&app, a.suggestions_per_hour);
            }
        }

        // Meeting offer: a call app in front and someone else using the mic.
        if agent.meetings
            && !agent.is_paused()
            && !crate::meeting::is_active()
            && offered
                .get(&front.bundle_id)
                .map_or(true, |t| t.elapsed() > OFFER_COOLDOWN)
            && crate::meeting::mic_in_use()
            && is_call(&front, &agent.never_watch)
        {
            offered.insert(front.bundle_id.clone(), Instant::now());
            crate::hud::show(
                &app,
                crate::hud::HudContent::Suggestion {
                    id: MEETING_OFFER_ID.into(),
                    title: "hud.meetingOffer".into(),
                    accept_label: "hud.takeNotes".into(),
                    vars: Default::default(),
                },
            );
        }
        // Proactive: once per visit, after DWELL, never over a recording, a
        // meeting or another HUD card. Decided on device; nothing is sent.
        // Why a window got no suggestion is logged once per window at debug
        // (privacy-safe: bundle id and a title tag only), per tick at trace.
        let skip = if !agent.proactive {
            Some("proactive off".to_string())
        } else if agent.is_paused() {
            Some("paused".into())
        } else if crate::limits::suggestions_done(&app) {
            // Free's suggestions this week are used (and the user was told):
            // don't spend judgements that can't be offered.
            Some("free suggestions used this week".into())
        } else {
            match &meta {
                Err(reason) => Some(format!("no snapshot ({reason:?})")),
                Ok(meta) => {
                    let key = (front.pid, meta.window_title.clone());
                    if window
                        .as_ref()
                        .map_or(true, |(p, t, _)| (p, t) != (&key.0, &key.1))
                    {
                        window = Some((key.0, key.1.clone(), Instant::now()));
                    }
                    let dwelled = window
                        .as_ref()
                        .is_some_and(|(_, _, at)| at.elapsed() >= DWELL);
                    if !dwelled {
                        log::trace!("proactive: not dwelled yet on {}", front.bundle_id);
                        None
                    } else if considered.as_ref() == Some(&key)
                        && !proactive::deferred_due(&format!("{}|{}", front.bundle_id, key.1))
                    {
                        log::trace!("proactive: already considered this window");
                        None
                    } else if crate::hud::is_visible() {
                        Some("HUD visible".into())
                    } else if crate::meeting::is_active() {
                        Some("meeting active".into())
                    } else if is_recording(&app) {
                        Some("recording".into())
                    } else if proactive::busy() {
                        Some("still judging the previous window".into())
                    } else {
                        considered = Some(key);
                        match context::snapshot(proactive::text_chars(), &agent.never_watch) {
                            Ok(snap) => {
                                log::debug!(
                                    "proactive: considering {} title[{}] after {}s dwell",
                                    front.bundle_id,
                                    context::title_tag(&snap.window_title),
                                    DWELL.as_secs()
                                );
                                proactive::consider_in_background(
                                    &app,
                                    snap,
                                    agent.suggestions_per_hour,
                                );
                                None
                            }
                            Err(reason) => Some(format!("no text snapshot ({reason:?})")),
                        }
                    }
                }
            }
        };
        if let Some(reason) = skip {
            let tag = meta
                .as_ref()
                .map(|m| context::title_tag(&m.window_title))
                .unwrap_or_default();
            let line = format!(
                "proactive: skipped {} title[{tag}]: {reason}",
                front.bundle_id
            );
            let key = format!("{}|{tag}|{reason}", front.pid);
            if last_skip.as_deref() != Some(&key) {
                log::debug!("{line}");
                last_skip = Some(key);
            } else {
                log::trace!("{line}");
            }
        }

        let due = last_capture.map_or(true, |t| t.elapsed() >= IDLE_RECAPTURE);
        if !due {
            continue;
        }
        last_capture = Some(Instant::now());

        // The 2-minute rolling memory (in RAM only) needs screen context;
        // the encrypted on-disk memory needs screen memory too. Both are
        // local and on every plan; Free's memory keeps `free.memory_hours`.
        if !(agent.screen_context || agent.screen_memory) || agent.is_paused() {
            continue;
        }
        match context::snapshot(SNAPSHOT_CHARS, &agent.never_watch) {
            Ok(mut snap) => {
                snap.text = snap.text.map(|t| redact(&t).0);
                snap.selection = None;
                snap.focused_text = None;
                remember_recent(&snap);
                if agent.screen_memory {
                    if let Some(recall) = crate::recall::get() {
                        crate::recall::set_cap_hours(crate::limits::memory_cap_hours(&app));
                        recall.purge_if_due();
                        if let Err(e) = recall.add_screen(&snap) {
                            log::debug!("screen memory write failed: {e}");
                        }
                    }
                }
            }
            Err(reason) => log::trace!("no snapshot: {reason:?}"),
        }
    }
}

/// agent-watch's idea: the last couple of minutes of windows, kept in memory
/// only (never on disk), so "what was on the page I just closed?" works even
/// without screen memory.
const RECENT_WINDOW: Duration = Duration::from_secs(120);
static RECENT: Mutex<std::collections::VecDeque<(Instant, context::ContextSnapshot)>> =
    Mutex::new(std::collections::VecDeque::new());

fn remember_recent(snap: &context::ContextSnapshot) {
    if let Ok(mut r) = RECENT.lock() {
        r.retain(|(t, s)| t.elapsed() < RECENT_WINDOW && s.window_title != snap.window_title);
        r.push_back((Instant::now(), snap.clone()));
        while r.len() > 12 {
            r.pop_front();
        }
    }
}

pub fn forget_recent() {
    if let Ok(mut r) = RECENT.lock() {
        r.clear();
    }
}

/// ±`radius` chars around the first query word found, or None.
fn snippet(text: &str, words: &[String], radius: usize) -> Option<String> {
    let lower = text.to_lowercase();
    let at = words.iter().filter_map(|w| lower.find(w.as_str())).min()?;
    let start = lower[..at]
        .char_indices()
        .rev()
        .nth(radius)
        .map_or(0, |(i, _)| i);
    let tail: String = text[start..].chars().take(radius * 2).collect();
    Some(tail.replace('\n', " "))
}

/// Something the user did for the first time worth celebrating: the Home
/// checklist ticks itself off from these. Names are stable ("answer",
/// "about_screen", "reminder", "event", "action", "recall", "meeting",
/// "suggestion").
pub fn milestone(app: &AppHandle, name: &str) {
    use tauri::Emitter;
    let _ = app.emit("agent-milestone", name);
}

/// Run a routed request (anything but Write, which pastes as usual).
pub fn handle(app: &AppHandle, route: Route) {
    match &route {
        Route::Answer {
            about_screen: true, ..
        } => milestone(app, "about_screen"),
        Route::Answer { .. } => milestone(app, "answer"),
        Route::Act(router::Action::Reminder { .. }) => milestone(app, "reminder"),
        Route::Act(router::Action::CalendarEvent { .. }) => milestone(app, "event"),
        Route::Act(_) => milestone(app, "action"),
        Route::Recall(_) => milestone(app, "recall"),
        Route::Compose(_) => milestone(app, "answer"),
        Route::Write(_) | Route::Help | Route::Handled | Route::Report(_) => {}
    }
    log::debug!("agent: handling {}", router::route_name(Some(&route)));
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match route {
            Route::Write(_) | Route::Handled => {}
            Route::Help => crate::hud::show(&app, crate::hud::HudContent::Help),
            // "Send this to the team?": nothing leaves until Send. A report
            // with diagnostics on carries the last answer (feedback::submit).
            Route::Report(intent) => report::show(&app, intent),
            // Draft from the instruction and what's on screen (the thread
            // being replied to), then insert it or offer it.
            Route::Compose(instruction) => {
                answer::run_with(
                    app,
                    instruction,
                    false,
                    true,
                    None,
                    answer::Opts {
                        write: true,
                        compose: true,
                        ..Default::default()
                    },
                )
                .await
            }
            Route::Answer {
                query,
                needs_web,
                about_screen,
            } => {
                let web = needs_web && !settings::get_settings(&app).agent.device_only();
                answer::run(app, query, web, about_screen, None).await;
            }
            Route::Act(action) => act::run(app, action).await,
            Route::Recall(query) => {
                // Searching windows, meetings and Spotlight blocks; keep it off
                // the async runtime. Spotlight runs once, alongside the rest,
                // and feeds both the model's context and the linked files.
                let q = query.clone();
                let files =
                    tauri::async_runtime::spawn_blocking(move || personal::spotlight_hits(&q));
                let (a, q) = (app.clone(), query.clone());
                let context = tauri::async_runtime::spawn_blocking(move || {
                    recall_context_without_files(&a, &q)
                });
                let files = files.await.unwrap_or_default();
                let mut context = context.await.unwrap_or_default();
                append_files(&mut context, &files);
                let (q, f) = (query.clone(), files);
                let links =
                    tauri::async_runtime::spawn_blocking(move || personal::find_with(&q, f))
                        .await
                        .unwrap_or_default();
                answer::run_with(
                    app,
                    query,
                    false,
                    false,
                    Some(context),
                    answer::Opts {
                        links,
                        ..Default::default()
                    },
                )
                .await;
            }
        }
    });
}

/// Past dictations (and screen memory, if kept) matching the question, as
/// dated snippets for the model to answer from.
pub(crate) fn recall_context(app: &AppHandle, query: &str) -> String {
    let mut out = recall_context_without_files(app, query);
    append_files(&mut out, &personal::spotlight_hits(query));
    out
}

const NOTHING_FOUND: &str = "(Nothing matching was found in the user's history.)";

/// Files and Mail messages on this Mac (Spotlight): names only.
fn append_files(out: &mut String, files: &[(String, String)]) {
    if out == NOTHING_FOUND && !files.is_empty() {
        out.clear();
    }
    for (name, url) in files {
        out.push_str(&format!("[file on this Mac] {name} ({url})\n"));
    }
}

fn recall_context_without_files(app: &AppHandle, query: &str) -> String {
    let mut out = String::new();
    let words: Vec<String> = query
        .split_whitespace()
        .map(|w| {
            w.trim_matches(|c: char| !c.is_alphanumeric())
                .to_lowercase()
        })
        .filter(|w| w.len() > 2)
        .collect();
    let agent = settings::get_settings(app).agent;
    // What's open right now, in any app, and what was on screen a moment ago.
    if agent.screen_context && !agent.is_paused() && !words.is_empty() {
        for w in context::open_windows(&agent.never_watch, 8000) {
            if let Some(snip) = snippet(&w.text, &words, 400) {
                out.push_str(&format!(
                    "[open now in {} — {}] {}\n",
                    w.name, w.title, snip
                ));
            }
        }
        if let Ok(recent) = RECENT.lock() {
            for (_, s) in recent.iter().rev() {
                if let Some(snip) = s.text.as_deref().and_then(|t| snippet(t, &words, 400)) {
                    out.push_str(&format!(
                        "[seen a moment ago in {} — {}] {}\n",
                        s.app.name, s.window_title, snip
                    ));
                }
            }
        }
    }
    let fmt = |ts: i64| {
        chrono::DateTime::from_timestamp(ts, 0)
            .map(|d| {
                d.with_timezone(&chrono::Local)
                    .format("%a %d %b %H:%M")
                    .to_string()
            })
            .unwrap_or_default()
    };
    if let Some(history) = app.try_state::<Arc<HistoryManager>>() {
        if let Ok(entries) = history.search_text(query, 8) {
            for e in entries {
                let text = e.post_processed_text.unwrap_or(e.transcription_text);
                out.push_str(&format!(
                    "[dictated {}] {}\n",
                    fmt(e.timestamp),
                    text.chars().take(600).collect::<String>()
                ));
            }
        }
    }
    if agent.screen_memory {
        if let Some(r) = crate::recall::get_if_open() {
            if let Ok(entries) = r.search_screen(query, None, 6) {
                for e in entries {
                    out.push_str(&format!(
                        "[seen {} in {} — {}] {}\n",
                        fmt(e.ts),
                        e.app,
                        e.title,
                        e.text.chars().take(800).collect::<String>()
                    ));
                }
            }
        }
    }
    // Meeting transcripts and notes.
    if let Some(r) = crate::recall::get_if_open() {
        if let Ok(meetings) = r.meetings(60) {
            let mut found = 0;
            for (_, started, _, plain) in meetings {
                let Ok(body) = serde_json::from_slice::<crate::meeting::MeetingBody>(&plain) else {
                    continue;
                };
                let title = body
                    .summary
                    .as_ref()
                    .map(|s| s.title.clone())
                    .unwrap_or_default();
                let text: String = body
                    .notes
                    .iter()
                    .cloned()
                    .chain(body.segments.iter().map(|s| s.text.clone()))
                    .collect::<Vec<_>>()
                    .join("\n");
                if let Some(snip) = snippet(&text, &words, 400) {
                    out.push_str(&format!(
                        "[meeting {} — {}] {}\n",
                        fmt(started),
                        title,
                        snip
                    ));
                    found += 1;
                    if found >= 4 {
                        break;
                    }
                }
            }
        }
    }
    if out.is_empty() {
        out.push_str(NOTHING_FOUND);
    }
    out
}

// ── Where text can go ────────────────────────────────────────────────────

/// Focused roles that are certainly not somewhere to type.
const NOT_TEXT_ROLES: &[&str] = &[
    "AXWebArea",
    "AXGroup",
    "AXButton",
    "AXLink",
    "AXList",
    "AXOutline",
    "AXTable",
    "AXRow",
    "AXCell",
    "AXScrollArea",
    "AXWindow",
    "AXImage",
    "AXStaticText",
    "AXMenuItem",
    "AXCheckBox",
    "AXRadioButton",
    "AXPopUpButton",
    "AXTabGroup",
    "AXSplitGroup",
    "AXBrowser",
    "AXHeading",
];

/// Whether focus is in a text field: Some(true) yes, Some(false) certainly
/// not, None when accessibility can't tell (the app exposes nothing).
pub fn classify_focus(role: Option<&str>, editable: bool, title: &str, url: &str) -> Option<bool> {
    if editable {
        return Some(true);
    }
    // Web editors that draw their own text surface (Docs, Notion, Figma…)
    // can report a page or group as focused while the user is typing.
    if RICH_EDITORS
        .iter()
        .any(|s| url.contains(s) || title.contains(s))
    {
        return None;
    }
    match role {
        Some(r) if NOT_TEXT_ROLES.contains(&r) => Some(false),
        _ => None,
    }
}

/// Sites (by URL, or the name in the window title) with canvas or custom
/// editors: never judged "not a text field".
const RICH_EDITORS: &[&str] = &[
    "docs.google.com",
    "- Google Docs",
    "- Google Sheets",
    "- Google Slides",
    "notion.so",
    "figma.com",
    "canva.com",
    "office.com",
    "sharepoint.com",
    "overleaf.com",
    "miro.com",
    "coda.io",
    "quip.com",
    "airtable.com",
    "excalidraw.com",
    "vscode.dev",
    "github.dev",
    "replit.com",
    "codesandbox.io",
];

/// Apps whose accessibility tree reliably says where focus is: browsers
/// (web pages) and Apple's own apps. Elsewhere (canvas apps, GPU terminals,
/// games) a "not a text field" reading can be wrong, so dictation is typed
/// as before.
pub(crate) fn focus_is_reliable(bundle: &str) -> bool {
    is_browser(bundle) || (bundle.starts_with("com.apple.") && bundle != "com.apple.Terminal")
}

/// Focus in the app in front (metadata only, never its text).
fn field_state() -> (Option<bool>, String) {
    let Some(front) = context::frontmost_app() else {
        return (None, String::new());
    };
    if front.bundle_id == env!("BRAND_IDENTIFIER") {
        return (Some(false), front.bundle_id);
    }
    match context::snapshot(0, &[]) {
        Ok(s) => (
            classify_focus(
                s.focused_role.as_deref(),
                s.editable && !s.secure,
                &s.window_title,
                s.url.as_deref().unwrap_or(""),
            ),
            front.bundle_id,
        ),
        Err(_) => (None, front.bundle_id),
    }
}

/// Insert makes sense here: a text field has focus, or we can't tell.
pub fn can_insert_here() -> bool {
    field_state().0 != Some(false)
}

/// Dictation with nowhere to go: instead of typing into a page (where keys
/// can trigger the site's shortcuts) or into nothing, show the text with
/// Copy, and Insert once a field has focus. Returns true when it did.
pub fn draft_instead_of_paste(app: &AppHandle, text: &str) -> bool {
    let (state, bundle) = field_state();
    if state != Some(false) || !focus_is_reliable(&bundle) || bundle == env!("BRAND_IDENTIFIER") {
        return false;
    }
    let id = show_draft(app, "hud.draft.title", text.to_string(), false);
    crate::telemetry::did_you_mean_shown(&id);
    true
}

fn show_draft(app: &AppHandle, title: &str, text: String, editable: bool) -> String {
    let id = format!("draft-{}", chrono::Utc::now().timestamp_millis());
    crate::hud::show(
        app,
        crate::hud::HudContent::Draft {
            id: id.clone(),
            title: title.into(),
            text,
            editable,
        },
    );
    id
}

/// A finished draft the user asked for by voice: typed where the cursor is;
/// with no reply box open in Mail or Gmail, one is opened first; otherwise
/// it's offered as a card (Copy, and Insert once they click into a field).
pub fn deliver_draft(
    app: &AppHandle,
    text: String,
    can_insert: bool,
    smart: Option<writing::SmartWrite>,
) {
    crate::hud::hide(app);
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        // Smart writing: typed with the chip, or replacing the text being
        // edited; the draft card only if it couldn't be typed.
        if let Some(smart) = &smart {
            if (can_insert || smart.replaces.is_some())
                && writing::deliver_written(&handle, &text, smart)
            {
                return;
            }
        }
        if can_insert {
            log::debug!("compose: a text field has focus; inserting the draft");
            if let Err(e) = crate::clipboard::paste(text.clone(), handle.clone()) {
                log::warn!("inserting the draft failed: {e}");
                show_draft(&handle, "hud.draft.composed", text, false);
            }
            return;
        }
        reply_then_paste(&handle, text);
    });
}

/// Open a reply to the message in front and paste the draft into it; show
/// the draft card if no reply box could be opened. Call off the main thread.
fn reply_then_paste(app: &AppHandle, text: String) {
    match open_reply_box(app) {
        Ok(how) => {
            log::debug!("compose: reply box open ({how}); pasting the draft");
            if let Err(e) = crate::clipboard::paste(text.clone(), app.clone()) {
                log::warn!("pasting the reply failed: {e}");
                show_draft(app, "hud.draft.composed", text, false);
            }
        }
        Err(why) => {
            log::debug!("compose: no reply box ({why}); showing the draft");
            show_draft(app, "hud.draft.composed", text, false);
        }
    }
}

/// Gmail's Reply, as the button or link is named in its main languages.
const REPLY_LABELS: &[&str] = &[
    "Reply",
    "Responder",
    "Antworten",
    "Répondre",
    "Rispondi",
    "Odpowiedz",
    "Ответить",
    "Відповісти",
    "Beantwoorden",
    "Svara",
    "Svar",
    "Odpovědět",
    "Yanıtla",
    "Balas",
    "Trả lời",
    "返信",
    "回复",
    "回覆",
    "답장",
    "השב",
    "رد",
    "जवाब दें",
];

/// Webmail in a browser, from the URL or the window title. Google Workspace
/// titles end with the organisation's "… Mail", not "Gmail":
/// "Subject - sam@acme.com - Acme Mail".
pub fn is_webmail_window(url: &str, title: &str) -> bool {
    url.contains("mail.google.com")
        || title.ends_with(" - Gmail")
        || (title.ends_with(" Mail") && title.contains('@') && title.contains(" - "))
}

/// Send ⌘R (Ctrl+R elsewhere) or a bare key to the app in front.
fn send_key(app: &AppHandle, key: char, command: bool) -> bool {
    app.try_state::<crate::input::EnigoState>()
        .and_then(|state| {
            let mut enigo = state.0.lock().ok()?;
            use enigo::{Direction, Key, Keyboard};
            #[cfg(target_os = "macos")]
            let modifier = Key::Meta;
            #[cfg(not(target_os = "macos"))]
            let modifier = Key::Control;
            if command {
                enigo.key(modifier, Direction::Press).ok()?;
            }
            let clicked = enigo.key(Key::Unicode(key), Direction::Click);
            std::thread::sleep(Duration::from_millis(30));
            if command {
                let _ = enigo.key(modifier, Direction::Release);
            }
            clicked.ok()
        })
        .is_some()
}

/// Wait for a text field to take focus (the reply body), up to `timeout`.
fn wait_for_field(timeout: Duration) -> Option<bool> {
    let start = Instant::now();
    let mut last = None;
    while start.elapsed() < timeout {
        std::thread::sleep(Duration::from_millis(120));
        last = field_state().0;
        if last == Some(true) {
            return last;
        }
    }
    last
}

/// Open a reply box: Mail with ⌘R; Gmail in a browser by pressing its Reply
/// button through accessibility (works whether or not Gmail's keyboard
/// shortcuts are on), else its "r" shortcut. Ok once a text field has focus.
fn open_reply_box(app: &AppHandle) -> Result<&'static str, &'static str> {
    let place = router::place();
    // Apple Mail (⌘R) and Outlook on Windows (Ctrl+R).
    if context::is_mail_app(&place.bundle_id) {
        if !send_key(app, 'r', true) {
            return Err("mail: couldn't send cmd-r");
        }
        // The compose body doesn't always report itself as a text field;
        // ⌘R / Ctrl+R reliably opens and focuses it, so paste unless focus
        // is certainly elsewhere.
        return match wait_for_field(Duration::from_millis(1500)) {
            Some(false) => Err("mail: cmd-r opened no reply"),
            _ => Ok("mail cmd-r"),
        };
    }
    if is_browser(&place.bundle_id) && is_webmail_window(&place.url, &place.title) {
        let pressed = context::press_labeled(REPLY_LABELS);
        log::debug!(
            "compose: gmail reply button press result {pressed} (0 pressed, 1 not found, 2 failed, 3 unavailable)"
        );
        if pressed == 0 && wait_for_field(Duration::from_millis(2500)) == Some(true) {
            return Ok("gmail reply button");
        }
        // Gmail's own shortcut, which only works with keyboard shortcuts on
        // and focus on the thread. Never typed into a field: focus isn't one.
        if field_state().0 == Some(false)
            && send_key(app, 'r', false)
            && wait_for_field(Duration::from_millis(2000)) == Some(true)
        {
            return Ok("gmail r shortcut");
        }
        return Err("gmail: no reply field took focus");
    }
    Err("not mail or gmail")
}

/// The HUD's "Reply" on a drafted answer: open a reply and paste the draft.
pub fn reply_with(app: &AppHandle, text: String) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        reply_then_paste(&handle, text);
    });
}

// ── "Ask Ambient instead" ────────────────────────────────────────────────

/// "Did you mean to type this?" → "Ask Ambient instead": the same words, as
/// if said with the Ask key (never typed).
pub fn ask_instead(app: &AppHandle, text: String) {
    let text = text.trim().to_string();
    if text.is_empty() {
        return;
    }
    crate::hud::show(
        app,
        crate::hud::HudContent::Listening {
            heard: text.clone(),
        },
    );
    answer::prefetch_screen(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let route = route_for_agent(&app, &text).await;
        crate::telemetry::route(router::route_name(Some(&route)), true, false);
        handle(&app, route);
    });
}

/// Route words that are certainly for the agent: the first passes, then
/// the router told never to write; an answer when it can't decide.
pub(crate) async fn route_for_agent(app: &AppHandle, text: &str) -> Route {
    if router::is_help_request(text) {
        return Route::Help;
    }
    if let Some(r) = report::report_intent(text) {
        return Route::Report(r);
    }
    if let Some(r) = when::reminder_request(text, chrono::Local::now().naive_local()) {
        return Route::Act(router::Action::Reminder {
            due: r.due_string(),
            title: r.title,
        });
    }
    if let compose::ComposeIntent::Yes(i) = compose::compose_intent(text) {
        return Route::Compose(i);
    }
    let answer = || Route::Answer {
        query: text.to_string(),
        needs_web: false,
        about_screen: false,
    };
    if llm::target(app).is_none() {
        return answer();
    }
    let place = tauri::async_runtime::spawn_blocking(router::place)
        .await
        .unwrap_or_default();
    match router::route(app, text, "", &place, true, answer::last_turn()).await {
        Some(Route::Write(_)) | None => answer(),
        Some(r) => r,
    }
}

// ── "Search this instead?" ───────────────────────────────────────────────

pub const CHIP_PREFIX: &str = "chip-";
static CHIP: Mutex<Option<(String, String)>> = Mutex::new(None);

/// After a phrase that sounded like a question was typed (the router said
/// "write"), offer to search it instead for a few seconds.
pub fn offer_search_instead(app: &AppHandle, text: &str) {
    if crate::hud::is_visible() {
        return;
    }
    let id = format!("{CHIP_PREFIX}{}", chrono::Utc::now().timestamp_millis());
    if let Ok(mut g) = CHIP.lock() {
        *g = Some((id.clone(), text.to_string()));
    }
    crate::hud::show(
        app,
        crate::hud::HudContent::Suggestion {
            id,
            title: "hud.chip.searchInstead".into(),
            accept_label: "hud.chip.search".into(),
            vars: Default::default(),
        },
    );
}

/// Accepting takes the paste back (Cmd+Z) and answers it instead.
fn on_chip_action(app: &AppHandle, id: &str, action: &str) {
    let Some((chip_id, text)) = CHIP.lock().ok().and_then(|mut g| g.take()) else {
        return;
    };
    if chip_id != id || action != "accept" {
        return;
    }
    crate::hud::hide(app);
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        if let Some(state) = handle.try_state::<crate::input::EnigoState>() {
            if let Ok(mut enigo) = state.0.lock() {
                let _ = crate::input::send_undo(&mut enigo);
            }
        }
        tauri::async_runtime::spawn(
            async move { answer::run(handle, text, true, false, None).await },
        );
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn knows_when_focus_is_not_a_text_field() {
        let gmail = "https://mail.google.com/mail/u/0/#inbox";
        assert_eq!(
            classify_focus(Some("AXTextArea"), true, "", gmail),
            Some(true)
        );
        assert_eq!(
            classify_focus(Some("AXWebArea"), false, "", gmail),
            Some(false)
        );
        assert_eq!(classify_focus(Some("AXLink"), false, "", ""), Some(false));
        // Nothing exposed, or an unusual role: can't tell, so type as before.
        assert_eq!(classify_focus(None, false, "", ""), None);
        assert_eq!(classify_focus(Some("AXUnknown"), false, "", ""), None);
        // Canvas editors: never judged by the focused role.
        assert_eq!(
            classify_focus(Some("AXWebArea"), false, "Plan - Google Docs", ""),
            None
        );
        assert_eq!(
            classify_focus(Some("AXGroup"), false, "", "https://www.notion.so/x"),
            None
        );
    }

    #[test]
    fn only_trusts_focus_where_accessibility_is_reliable() {
        assert!(focus_is_reliable("com.google.Chrome"));
        assert!(focus_is_reliable("com.apple.finder"));
        assert!(!focus_is_reliable("com.figma.Desktop"));
        assert!(!focus_is_reliable("dev.warp.Warp-Stable"));
        assert!(!focus_is_reliable("com.apple.Terminal"));
    }
}
