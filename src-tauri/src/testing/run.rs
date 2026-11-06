//! Running one scenario through the real pipeline, then printing what
//! happened as one JSON object on stdout.
//!
//! A dictation goes through `actions::process_dictation_output` (markers,
//! the first pass, the router, smart writing) and is then handed on the way
//! the stop path hands it on: written for the user, given to the agent, or
//! typed (or offered as "Did you mean to type this?"). A screen is read
//! through `context::snapshot` (the private-place judge included) and
//! considered by `agent::proactive`, like the agent loop does after a dwell.

use std::time::Duration;

use serde_json::{json, Value};
use tauri::AppHandle;

use super::{record, scenario, Key, Kind};
use crate::actions::{process_dictation_output, OutputMode};
use crate::agent::router::{Action, Route};

/// Run the scenario on a worker thread, print the report and exit.
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let report = tauri::async_runtime::block_on(run(app));
        use std::io::Write;
        let mut out = std::io::stdout();
        let _ = writeln!(out, "{report}");
        let _ = out.flush();
        let _ = std::io::stderr().flush();
        std::process::exit(0);
    });
}

async fn run(app: AppHandle) -> Value {
    let Some(s) = scenario() else {
        return json!({ "error": "no scenario" });
    };
    seed_card(&app);
    let processed = match s.kind {
        Kind::Dictation => Some(dictation(&app, &s.transcript, s.key).await),
        Kind::Screen => {
            screen(&app);
            None
        }
    };
    settle(s.wait_ms.unwrap_or(45_000)).await;
    json!({
        "id": s.id,
        "os": std::env::consts::OS,
        "version": env!("CARGO_PKG_VERSION"),
        "processed": processed,
        "events": super::events(),
        "hud_final": crate::hud::current().and_then(|c| serde_json::to_value(c).ok()),
    })
}

/// A card already up when the user speaks ("close that", a follow-up).
fn seed_card(app: &AppHandle) {
    let Some(card) = scenario().and_then(|s| s.card.as_ref()) else {
        return;
    };
    use crate::hud::HudContent;
    // A suggestion is offered for real: the window is considered first, as
    // the agent loop would, so answering it by voice finds it pending.
    if card.kind == "suggestion" {
        screen(app);
        record("seeded", json!({}));
        return;
    }
    if card.kind == "answer" {
        crate::agent::answer::seed_turn(&card.question, &card.text);
    }
    let content = match card.kind.as_str() {
        "help" => HudContent::Help,
        "draft" => HudContent::Draft {
            id: "draft-seeded".into(),
            title: "hud.draft.title".into(),
            text: card.text.clone(),
            editable: false,
        },
        _ => HudContent::Answer {
            id: "answer-seeded".into(),
            question: card.question.clone(),
            text: card.text.clone(),
            sources: vec![],
            done: true,
            replace: false,
            actions: vec![],
            note: None,
        },
    };
    crate::hud::show(app, content);
    record("seeded", json!({}));
}

/// What `actions` decided, then what the stop path does with it.
async fn dictation(app: &AppHandle, transcript: &str, key: Key) -> Value {
    let plan = crate::agent::writing::WritePlan::for_dictation(app, key == Key::Polish);
    let mode = if key == Key::Ask {
        OutputMode::Ask
    } else {
        OutputMode::Dictation
    };
    let p = process_dictation_output(app, transcript, plan, mode, None).await;
    let summary = json!({
        "final_text": p.final_text,
        "polished": p.post_processed_text.is_some(),
        "route": p.agent_route.as_ref().map(route_json),
        "written": p.written.as_ref().map(|w| json!({
            "instruction": w.instruction,
            "has_selection": w.has_selection,
        })),
        "offer_search": p.offer_search,
        "writing": p.writing.as_ref().map(|t| t.decision.name()),
    });
    record("processed", summary.clone());
    if let Some(request) = p.written {
        crate::agent::writing::write_now(app.clone(), request).await;
    } else if let Some(route) = p.agent_route {
        crate::agent::handle(app, route);
    } else if crate::clipboard::is_pasteable(&p.final_text) {
        let (app, text, how, offer) = (app.clone(), p.final_text, p.writing, p.offer_search);
        // The paste thread's order: a card instead when there's no field,
        // else typed, then the chip or "Search this instead?".
        let _ = tauri::async_runtime::spawn_blocking(move || {
            if crate::agent::draft_instead_of_paste(&app, &text) {
                return;
            }
            if let Ok(typed) = crate::clipboard::paste_dictation(text.clone(), app.clone()) {
                if let Some(how) = how {
                    crate::agent::writing::after_insert(&app, how, &typed);
                } else if let Some(q) = &offer {
                    crate::agent::offer_search_instead(&app, q);
                }
            }
        })
        .await;
    }
    summary
}

/// The agent loop's view of a window the user stayed on.
fn screen(app: &AppHandle) {
    let agent = crate::settings::get_settings(app).agent;
    if !agent.proactive || agent.is_paused() || crate::limits::suggestions_done(app) {
        record("quiet", json!({ "why": "suggestions off" }));
        return;
    }
    match crate::context::snapshot(crate::agent::proactive::text_chars(), &agent.never_watch) {
        Ok(snap) => {
            record(
                "considered",
                json!({ "text_chars": snap.text.as_deref().map_or(0, |t| t.chars().count()) }),
            );
            // On its own thread, as `consider_in_background` runs it.
            let app = app.clone();
            let per_hour = agent.suggestions_per_hour;
            let _ = std::thread::spawn(move || {
                crate::agent::proactive::consider(&app, snap, per_hour);
            })
            .join();
        }
        Err(reason) => record("snapshot_skipped", json!({ "why": format!("{reason:?}") })),
    }
}

/// Wait until the agent has finished: a little quiet after the last thing
/// it did, a longer quiet while a model call may still be running.
async fn settle(max_ms: u64) {
    let started = std::time::Instant::now();
    loop {
        tokio::time::sleep(Duration::from_millis(100)).await;
        let quiet = super::quiet_for_ms();
        let events = super::events();
        let finished = events.last().is_some_and(is_final);
        // A model or answer request on its way: give it the server's time.
        let waiting = events.last().is_some_and(|e| {
            matches!(e["type"].as_str(), Some("model" | "answer_request"))
                || (e["type"] == "hud"
                    && (e["card"]["kind"] == "listening"
                        || (e["card"]["kind"] == "answer" && e["card"]["done"] != true)))
        });
        let enough = if waiting { 30_000 } else { 4_000 };
        if (finished && quiet > 600) || quiet > enough {
            return;
        }
        if started.elapsed() > Duration::from_millis(max_ms) {
            record("timeout", json!({}));
            return;
        }
    }
}

/// Events after which nothing else is coming.
fn is_final(e: &Value) -> bool {
    match e["type"].as_str() {
        Some("paste" | "open_url" | "open_app" | "act" | "snapshot_skipped" | "quiet") => true,
        Some("hud") => {
            let card = &e["card"];
            match card["kind"].as_str() {
                Some("answer") => card["done"].as_bool() == Some(true),
                Some("listening") => false,
                Some("status") => false,
                _ => true,
            }
        }
        _ => false,
    }
}

fn route_json(route: &Route) -> Value {
    let name = crate::agent::router::route_name(Some(route));
    match route {
        Route::Write(text) => json!({ "name": name, "text": text }),
        Route::Answer {
            query,
            needs_web,
            about_screen,
        } => json!({
            "name": name, "query": query, "needs_web": needs_web, "about_screen": about_screen,
        }),
        Route::Act(action) => json!({
            "name": name,
            "action": serde_json::to_value(action).unwrap_or(Value::Null),
            "kind": act_kind(action),
        }),
        Route::Recall(q) => json!({ "name": name, "query": q }),
        Route::Compose(i) => json!({ "name": name, "instruction": i }),
        Route::Report(r) => json!({ "name": name, "message": r.message, "explicit": r.explicit }),
        Route::Help | Route::Dismiss | Route::Handled => json!({ "name": name }),
    }
}

fn act_kind(a: &Action) -> &'static str {
    match a {
        Action::OpenApp { .. } => "open_app",
        Action::OpenUrl { .. } => "open_url",
        Action::WebSearch { .. } => "web_search",
        Action::Reminder { .. } => "reminder",
        Action::CalendarEvent { .. } => "calendar_event",
        Action::Shortcut { .. } => "shortcut",
        Action::CloseWindow { .. } => "close_window",
        Action::Unsupported { .. } => "unsupported",
    }
}
