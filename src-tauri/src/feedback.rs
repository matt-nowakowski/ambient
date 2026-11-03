// STUB: replaced at merge.
//
// The "analytics & delivery" work owns this module and its real `submit`
// (delivery to the team, diagnostics). This stub only has the agreed shape
// so the voice "report a bug" flow compiles and can be exercised; it logs
// and returns Ok.

/// What kind of report it is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeedbackKind {
    Bug,
    Idea,
    Other,
}

/// Where the report came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum FeedbackSource {
    Voice,
    Dialog,
    Thumbs,
}

/// The question and answer the report is about, when there is one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FeedbackExample {
    pub question: String,
    pub answer: String,
}

#[derive(Debug, Clone)]
pub struct Feedback {
    pub kind: FeedbackKind,
    pub message: String,
    pub include_diagnostics: bool,
    pub example: Option<FeedbackExample>,
    pub source: FeedbackSource,
}

/// STUB: replaced at merge. Logs the report's shape (never its text).
pub fn submit(feedback: Feedback) -> Result<(), String> {
    log::info!(
        "feedback (stub): {:?} from {:?}, {} chars, diagnostics={}, example={}",
        feedback.kind,
        feedback.source,
        feedback.message.chars().count(),
        feedback.include_diagnostics,
        feedback.example.is_some()
    );
    Ok(())
}
