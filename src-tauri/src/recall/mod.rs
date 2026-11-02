//! Local, encrypted memory for the ambient agent: screen-text snapshots and
//! the network ledger.
//!
//! Every content field is sealed with AES-256-GCM under a key held in the
//! macOS Keychain; only the timestamp, the app's bundle id and a keyed dedup
//! digest are stored in the clear (the bundle id powers per-app deletion and
//! the "what's stored" view). Search decrypts the retention window in memory,
//! which at a 7-day window is a few thousand rows.

mod crypto;

use std::path::PathBuf;
use std::sync::Mutex;

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::context::ContextSnapshot;
use crypto::Sealer;

pub const DEFAULT_RETENTION_DAYS: i64 = 7;
const LEDGER_RETENTION_DAYS: i64 = 30;
/// Ledger previews are capped so the ledger can't become a second copy of
/// everything, but a whole cloud suggestion check (≤ 3500 chars of window
/// text plus its JSON) fits, so it's shown exactly as sent.
const LEDGER_PREVIEW_CHARS: usize = 4500;

/// The sealed part of a screen snapshot.
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct ScreenEntry {
    pub id: i64,
    pub ts: i64,
    pub bundle_id: String,
    pub app: String,
    pub title: String,
    pub url: Option<String>,
    pub text: String,
}

#[derive(Serialize, Deserialize)]
struct SealedScreen {
    app: String,
    title: String,
    url: Option<String>,
    text: String,
}

/// One outbound request, as shown in the Privacy Center.
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct LedgerEntry {
    pub id: i64,
    pub ts: i64,
    /// Host the request went to, e.g. "tryambient.ai".
    pub destination: String,
    /// Why: "polish", "answer", "suggestion", "summary", "license", …
    pub purpose: String,
    /// Exactly what text was sent (truncated for display).
    pub preview: String,
    pub bytes: i64,
}

#[derive(Serialize, Deserialize)]
struct SealedLedger {
    destination: String,
    purpose: String,
    preview: String,
}

#[derive(Serialize, Debug, Clone, Type)]
pub struct AppUsage {
    pub bundle_id: String,
    pub entries: i64,
}

#[derive(Serialize, Debug, Clone, Type)]
pub struct RecallStats {
    pub screen_entries: i64,
    pub ledger_entries: i64,
    pub oldest_ts: Option<i64>,
    pub by_app: Vec<AppUsage>,
    pub retention_days: i64,
}

pub struct Recall {
    conn: Mutex<Connection>,
    sealer: Sealer,
    retention_days: Mutex<i64>,
}

impl Recall {
    pub fn open(dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&dir)?;
        let path = dir.join("recall.db");
        let conn = Connection::open(&path)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
        conn.execute_batch(
            "pragma journal_mode = wal;
             create table if not exists screen (
               id integer primary key,
               ts integer not null,
               bundle_id text not null,
               digest blob not null unique,
               sealed blob not null,
               saved integer not null default 0
             );
             create index if not exists screen_ts on screen(ts);
             create table if not exists ledger (
               id integer primary key,
               ts integer not null,
               bytes integer not null,
               sealed blob not null
             );
             create index if not exists ledger_ts on ledger(ts);
             create table if not exists meetings (
               id integer primary key,
               started integer not null,
               ended integer,
               sealed blob not null
             );",
        )?;
        let recall = Self {
            conn: Mutex::new(conn),
            sealer: Sealer::load(&dir)?,
            retention_days: Mutex::new(DEFAULT_RETENTION_DAYS),
        };
        recall.purge_expired()?;
        Ok(recall)
    }

    fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    pub fn set_retention_days(&self, days: i64) {
        *self
            .retention_days
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = days.clamp(1, 90);
    }

    fn retention(&self) -> i64 {
        *self
            .retention_days
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// Store an already-redacted snapshot. Identical text (same app) is stored once.
    pub fn add_screen(&self, snap: &ContextSnapshot) -> Result<bool> {
        let text = snap.text.clone().unwrap_or_default();
        if text.trim().len() < 20 {
            return Ok(false);
        }
        let digest = self
            .sealer
            .digest(&[snap.app.bundle_id.as_bytes(), text.as_bytes()]);
        let sealed = self.sealer.seal(&serde_json::to_vec(&SealedScreen {
            app: snap.app.name.clone(),
            title: snap.window_title.clone(),
            url: snap.url.clone(),
            text,
        })?)?;
        let n = self.conn().execute(
            "insert into screen (ts, bundle_id, digest, sealed) values (?1, ?2, ?3, ?4)
             on conflict(digest) do update set ts = excluded.ts",
            params![snap.ts, snap.app.bundle_id, digest, sealed],
        )?;
        Ok(n > 0)
    }

    /// Newest-first screen entries whose title, url or text contains every word
    /// of `query` (case-insensitive). Empty query returns the most recent.
    pub fn search_screen(
        &self,
        query: &str,
        since: Option<i64>,
        limit: usize,
    ) -> Result<Vec<ScreenEntry>> {
        let words: Vec<String> = query.split_whitespace().map(str::to_lowercase).collect();
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "select id, ts, bundle_id, sealed from screen where ts >= ?1 order by ts desc",
        )?;
        let rows = stmt.query_map(params![since.unwrap_or(0)], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Vec<u8>>(3)?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (id, ts, bundle_id, sealed) = row?;
            let Ok(plain) = self.sealer.open(&sealed) else {
                continue;
            };
            let Ok(s) = serde_json::from_slice::<SealedScreen>(&plain) else {
                continue;
            };
            if !words.is_empty() {
                let hay = format!("{} {} {}", s.title, s.url.as_deref().unwrap_or(""), s.text)
                    .to_lowercase();
                if !words.iter().all(|w| hay.contains(w.as_str())) {
                    continue;
                }
            }
            out.push(ScreenEntry {
                id,
                ts,
                bundle_id,
                app: s.app,
                title: s.title,
                url: s.url,
                text: s.text,
            });
            if out.len() >= limit {
                break;
            }
        }
        Ok(out)
    }

    /// Record an outbound request. `payload` is what was sent; it's stored
    /// truncated so the user can see exactly what left the Mac.
    pub fn log_request(&self, destination: &str, purpose: &str, payload: &str) -> Result<()> {
        let preview: String = payload.chars().take(LEDGER_PREVIEW_CHARS).collect();
        let sealed = self.sealer.seal(&serde_json::to_vec(&SealedLedger {
            destination: destination.to_string(),
            purpose: purpose.to_string(),
            preview,
        })?)?;
        self.conn().execute(
            "insert into ledger (ts, bytes, sealed) values (?1, ?2, ?3)",
            params![chrono::Utc::now().timestamp(), payload.len() as i64, sealed],
        )?;
        Ok(())
    }

    pub fn ledger(&self, limit: usize) -> Result<Vec<LedgerEntry>> {
        let conn = self.conn();
        let mut stmt =
            conn.prepare("select id, ts, bytes, sealed from ledger order by ts desc limit ?1")?;
        let rows = stmt.query_map(params![limit as i64], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, Vec<u8>>(3)?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (id, ts, bytes, sealed) = row?;
            let Ok(plain) = self.sealer.open(&sealed) else {
                continue;
            };
            let Ok(l) = serde_json::from_slice::<SealedLedger>(&plain) else {
                continue;
            };
            out.push(LedgerEntry {
                id,
                ts,
                destination: l.destination,
                purpose: l.purpose,
                preview: l.preview,
                bytes,
            });
        }
        Ok(out)
    }

    pub fn stats(&self) -> Result<RecallStats> {
        let conn = self.conn();
        let screen_entries = conn.query_row("select count(*) from screen", [], |r| r.get(0))?;
        let ledger_entries = conn.query_row("select count(*) from ledger", [], |r| r.get(0))?;
        let oldest_ts = conn.query_row("select min(ts) from screen", [], |r| r.get(0))?;
        let mut stmt = conn.prepare(
            "select bundle_id, count(*) from screen group by bundle_id order by count(*) desc",
        )?;
        let by_app = stmt
            .query_map([], |r| {
                Ok(AppUsage {
                    bundle_id: r.get(0)?,
                    entries: r.get(1)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(RecallStats {
            screen_entries,
            ledger_entries,
            oldest_ts,
            by_app,
            retention_days: self.retention(),
        })
    }

    /// Insert (id = None) or replace a meeting; `body` is sealed whole.
    pub fn save_meeting(
        &self,
        id: Option<i64>,
        started: i64,
        ended: Option<i64>,
        body: &[u8],
    ) -> Result<i64> {
        let sealed = self.sealer.seal(body)?;
        let conn = self.conn();
        match id {
            Some(id) => {
                conn.execute(
                    "update meetings set ended = ?2, sealed = ?3 where id = ?1",
                    params![id, ended, sealed],
                )?;
                Ok(id)
            }
            None => {
                conn.execute(
                    "insert into meetings (started, ended, sealed) values (?1, ?2, ?3)",
                    params![started, ended, sealed],
                )?;
                Ok(conn.last_insert_rowid())
            }
        }
    }

    /// (id, started, ended, decrypted body), newest first.
    pub fn meetings(&self, limit: usize) -> Result<Vec<(i64, i64, Option<i64>, Vec<u8>)>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "select id, started, ended, sealed from meetings order by started desc limit ?1",
        )?;
        let rows = stmt.query_map(params![limit as i64], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, Option<i64>>(2)?,
                r.get::<_, Vec<u8>>(3)?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (id, started, ended, sealed) = row?;
            if let Ok(plain) = self.sealer.open(&sealed) {
                out.push((id, started, ended, plain));
            }
        }
        Ok(out)
    }

    pub fn meeting(&self, id: i64) -> Result<Option<(i64, Option<i64>, Vec<u8>)>> {
        let conn = self.conn();
        let row = conn
            .query_row(
                "select started, ended, sealed from meetings where id = ?1",
                params![id],
                |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, Option<i64>>(1)?,
                        r.get::<_, Vec<u8>>(2)?,
                    ))
                },
            )
            .optional()?;
        Ok(match row {
            Some((started, ended, sealed)) => Some((started, ended, self.sealer.open(&sealed)?)),
            None => None,
        })
    }

    pub fn delete_meeting(&self, id: i64) -> Result<()> {
        self.conn()
            .execute("delete from meetings where id = ?1", params![id])?;
        Ok(())
    }

    pub fn meetings_since(&self, ts: i64) -> Result<i64> {
        Ok(self.conn().query_row(
            "select count(*) from meetings where started >= ?1",
            params![ts],
            |r| r.get(0),
        )?)
    }

    pub fn delete_app(&self, bundle_id: &str) -> Result<usize> {
        Ok(self.conn().execute(
            "delete from screen where bundle_id = ?1",
            params![bundle_id],
        )?)
    }

    /// "Delete everything": screen memory and the ledger.
    pub fn delete_all(&self) -> Result<()> {
        self.conn()
            .execute_batch("delete from screen; delete from ledger; vacuum;")?;
        Ok(())
    }

    pub fn purge_expired(&self) -> Result<()> {
        let now = chrono::Utc::now().timestamp();
        let conn = self.conn();
        conn.execute(
            "delete from screen where saved = 0 and ts < ?1",
            params![now - self.retention() * 86_400],
        )?;
        conn.execute(
            "delete from ledger where ts < ?1",
            params![now - LEDGER_RETENTION_DAYS * 86_400],
        )?;
        Ok(())
    }
}

/// Where the store lives and its retention, recorded at startup. The store
/// itself (and its Keychain key) is only opened on first use, so people who
/// never touch the agent never touch the Keychain.
static CONFIG: once_cell::sync::OnceCell<(PathBuf, i64)> = once_cell::sync::OnceCell::new();
static RECALL: once_cell::sync::OnceCell<Recall> = once_cell::sync::OnceCell::new();

pub fn init(dir: PathBuf, retention_days: i64) -> Result<()> {
    CONFIG
        .set((dir, retention_days))
        .map_err(|_| anyhow!("recall already initialised"))
}

pub fn get() -> Option<&'static Recall> {
    let (dir, days) = CONFIG.get()?;
    RECALL
        .get_or_try_init(|| {
            let r = Recall::open(dir.clone())?;
            r.set_retention_days(*days);
            Ok::<_, anyhow::Error>(r)
        })
        .map_err(|e| log::warn!("agent memory unavailable: {e}"))
        .ok()
}

/// The store only if it already exists on disk: views like the Privacy Center
/// shouldn't be what first creates the Keychain key.
pub fn get_if_open() -> Option<&'static Recall> {
    if let Some(r) = RECALL.get() {
        return Some(r);
    }
    let (dir, _) = CONFIG.get()?;
    if dir.join("recall.db").exists() {
        get()
    } else {
        None
    }
}

/// Ledger an outbound request if the store is open. Never fails the caller.
pub fn log_request(destination: &str, purpose: &str, payload: &str) {
    if let Some(r) = get() {
        if let Err(e) = r.log_request(destination, purpose, payload) {
            log::warn!("network ledger write failed: {e}");
        }
    }
}

/// Ledger a request only if the store already exists: used for requests made
/// before anyone has touched the agent (trial, sign-in), so they never create
/// the Keychain key on their own.
pub fn log_request_if_open(destination: &str, purpose: &str, payload: &str) {
    if let Some(r) = get_if_open() {
        if let Err(e) = r.log_request(destination, purpose, payload) {
            log::warn!("network ledger write failed: {e}");
        }
    }
}
