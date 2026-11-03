import Dispatch
import Foundation
import FoundationModels

@available(macOS 26.0, *)
@Generable
private struct CleanedTranscript: Sendable {
    let cleanedText: String
}

// MARK: - Swift implementation for Apple LLM integration
// This file is compiled via Cargo build script for Apple Silicon targets

private typealias ResponsePointer = UnsafeMutablePointer<AppleLLMResponse>

private func duplicateCString(_ text: String) -> UnsafeMutablePointer<CChar>? {
    return text.withCString { basePointer in
        guard let duplicated = strdup(basePointer) else {
            return nil
        }
        return duplicated
    }
}

private func truncatedText(_ text: String, limit: Int) -> String {
    guard limit > 0 else { return text }
    let words = text.split(
        maxSplits: .max,
        omittingEmptySubsequences: true,
        whereSeparator: { $0.isWhitespace || $0.isNewline }
    )
    if words.count <= limit {
        return text
    }
    return words.prefix(limit).joined(separator: " ")
}

@_cdecl("is_apple_intelligence_available")
public func isAppleIntelligenceAvailable() -> Int32 {
    guard #available(macOS 26.0, *) else {
        return 0
    }

    let model = SystemLanguageModel.default
    switch model.availability {
    case .available:
        return 1
    case .unavailable:
        return 0
    }
}

@_cdecl("process_text_with_system_prompt_apple")
public func processTextWithSystemPrompt(
    _ systemPrompt: UnsafePointer<CChar>,
    _ userContent: UnsafePointer<CChar>,
    maxTokens: Int32
) -> UnsafeMutablePointer<AppleLLMResponse> {
    let swiftSystemPrompt = String(cString: systemPrompt)
    let swiftUserContent = String(cString: userContent)
    let responsePtr = ResponsePointer.allocate(capacity: 1)
    responsePtr.initialize(to: AppleLLMResponse(response: nil, success: 0, error_message: nil))

    guard #available(macOS 26.0, *) else {
        responsePtr.pointee.error_message = duplicateCString(
            "Apple Intelligence requires macOS 26 or newer."
        )
        return responsePtr
    }

    let model = SystemLanguageModel.default
    guard model.availability == .available else {
        responsePtr.pointee.error_message = duplicateCString(
            "Apple Intelligence is not currently available on this device."
        )
        return responsePtr
    }

    let tokenLimit = max(0, Int(maxTokens))
    let semaphore = DispatchSemaphore(value: 0)

    // Thread-safe container to pass results from async task back to calling thread
    final class ResultBox: @unchecked Sendable {
        var response: String?
        var error: String?
    }
    let box = ResultBox()

    Task.detached(priority: .userInitiated) {
        defer { semaphore.signal() }
        do {
            let session = LanguageModelSession(
                model: model,
                instructions: swiftSystemPrompt
            )
            var output: String

            do {
                let structured = try await session.respond(
                    to: swiftUserContent,
                    generating: CleanedTranscript.self
                )
                output = structured.content.cleanedText
            } catch {
                let fallbackGeneration = try await session.respond(to: swiftUserContent)
                output = fallbackGeneration.content
            }

            if tokenLimit > 0 {
                output = truncatedText(output, limit: tokenLimit)
            }
            box.response = output
        } catch {
            box.error = error.localizedDescription
        }
    }

    semaphore.wait()

    // Write to responsePtr on the calling thread after task completes
    if let response = box.response {
        responsePtr.pointee.response = duplicateCString(response)
        responsePtr.pointee.success = 1
    } else {
        responsePtr.pointee.error_message = duplicateCString(box.error ?? "Unknown error")
    }

    return responsePtr
}

@_cdecl("free_apple_llm_response")
public func freeAppleLLMResponse(_ response: UnsafeMutablePointer<AppleLLMResponse>?) {
    guard let response = response else { return }

    if let responseStr = response.pointee.response {
        free(UnsafeMutablePointer(mutating: responseStr))
    }

    if let errorStr = response.pointee.error_message {
        free(UnsafeMutablePointer(mutating: errorStr))
    }

    response.deallocate()
}
// MARK: - Voice agent routing (on-device first pass)

@available(macOS 26.0, *)
@Generable
private struct RouteDecision: Sendable {
    @Guide(
        description: "Who the words are for",
        .anyOf(["people_or_document", "assistant_question", "assistant_task", "assistant_memory"]))
    let target: String
}

private let routeInstructions = """
The user spoke these words while using their computer. Decide who they are for.
people_or_document: words to be typed into a message, email, chat or document for other people. Includes questions and requests to colleagues ("can we move the call to Thursday?", "how's the migration going?", "when are you free next week?", "should we use postgres or sqlite?", "open question: should we…").
assistant_question: a question for you, the assistant, about facts, conversions, the weather, time, news, or "summarise this" / "explain this error" / "translate this".
assistant_task: a command for you to do on the computer: open an app or website, search the web, set a reminder, add a calendar event, run a Shortcut.
assistant_memory: asks what the user themselves said, wrote or saw earlier ("what did I say about…", "what did I tell Ana…").
"""

/// Classify a transcript on device with guided generation. Returns a strdup'd
/// label ("write", "answer", "act", "recall") or NULL if unavailable/failed.
/// Free with `free`.
@_cdecl("ambient_classify_route")
public func ambientClassifyRoute(_ text: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>? {
    guard #available(macOS 26.0, *) else { return nil }
    guard case .available = SystemLanguageModel.default.availability else { return nil }
    let input = String(cString: text)
    let semaphore = DispatchSemaphore(value: 0)
    var label: String?
    Task.detached {
        defer { semaphore.signal() }
        let session = LanguageModelSession(instructions: routeInstructions)
        guard let r = try? await session.respond(to: input, generating: RouteDecision.self) else { return }
        label = [
            "people_or_document": "write", "assistant_question": "answer",
            "assistant_task": "act", "assistant_memory": "recall",
        ][r.content.target]
    }
    _ = semaphore.wait(timeout: .now() + 6)
    return label.flatMap { duplicateCString($0) }
}

// MARK: - Suggestion judge (guided generation)

/// The judge's verdict, generated straight into typed fields, so there is
/// never prose or broken JSON to parse. Keep `kind`'s choices in sync with
/// JUDGE_KINDS in src/agent/judge.rs.
@available(macOS 26.0, *)
@Generable
private struct JudgeVerdict: Sendable {
    @Guide(description: "true only if one concrete offer would clearly help the user right now")
    let help: Bool
    @Guide(
        description: "What kind of help",
        .anyOf([
            "summarise_thread", "draft_reply", "add_to_calendar", "summarise_page",
            "explain_error", "fix_formula", "review_code", "translate_page", "fill_form", "other",
        ]))
    let kind: String
    @Guide(description: "The offer: one short, concrete question to the user, the way a helpful colleague would ask, naming the specific thing (at most 60 characters)")
    let title: String
    @Guide(description: "How likely the user is to say yes, from 0 to 100")
    let confidence: Int
}

private func judgeJSON(_ fields: [String: Any]) -> UnsafeMutablePointer<CChar>? {
    guard let data = try? JSONSerialization.data(withJSONObject: fields),
          let text = String(data: data, encoding: .utf8)
    else { return nil }
    return duplicateCString(text)
}

/// Judge a window with the on-device model and guided generation. Returns a
/// strdup'd JSON object: the verdict `{"help","kind","title","confidence"}`
/// (confidence 0–1), or `{"error": "..."}` ("unavailable", "timeout", or
/// the model's error). Blocks up to `timeoutMs`; call off the main thread.
/// Free with `free`.
@_cdecl("ambient_judge_window")
public func ambientJudgeWindow(
    _ instructions: UnsafePointer<CChar>,
    _ input: UnsafePointer<CChar>,
    _ timeoutMs: Int32
) -> UnsafeMutablePointer<CChar>? {
    guard #available(macOS 26.0, *) else { return judgeJSON(["error": "unavailable"]) }
    guard case .available = SystemLanguageModel.default.availability else {
        return judgeJSON(["error": "unavailable"])
    }
    let system = String(cString: instructions)
    let prompt = String(cString: input)
    let semaphore = DispatchSemaphore(value: 0)

    final class Box: @unchecked Sendable {
        var fields: [String: Any]?
    }
    let box = Box()

    Task.detached(priority: .userInitiated) {
        defer { semaphore.signal() }
        do {
            let session = LanguageModelSession(instructions: system)
            let r = try await session.respond(
                to: prompt,
                generating: JudgeVerdict.self,
                options: GenerationOptions(temperature: 0)
            )
            let v = r.content
            box.fields = [
                "help": v.help,
                "kind": v.kind,
                "title": v.title,
                "confidence": Double(max(0, min(100, v.confidence))) / 100.0,
            ]
        } catch {
            box.fields = ["error": String(describing: error).prefix(120).description]
        }
    }
    let waited = semaphore.wait(timeout: .now() + .milliseconds(Int(max(1000, timeoutMs))))
    if waited == .timedOut {
        return judgeJSON(["error": "timeout"])
    }
    return judgeJSON(box.fields ?? ["error": "no result"])
}
