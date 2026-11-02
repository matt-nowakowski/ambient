import { languageIdentity, resolveModelLanguage } from "./languages.js";
export function detectorCodes(detector) {
    return new Map(detector.languages.map((code) => [languageIdentity(code), code]));
}
/** Return the detector's own label (iw/jw/tl/no included). */
export function detectorLanguageCode(codes, language) {
    return codes.get(languageIdentity(language));
}
/** Whether this ASR model needs the external detector for Auto, independent of preferences. */
export function requiresLanguageDetector(model) {
    return !model.capabilities.languageDetection &&
        new Set(model.languages.map(languageIdentity)).size > 1;
}
/** Preferred languages this model supports, in preference order, one per identity. */
function compatiblePreferences(model, preferred) {
    const byIdentity = new Map();
    for (const preference of preferred) {
        const language = resolveModelLanguage(model, preference);
        if (language !== undefined && !byIdentity.has(languageIdentity(language))) {
            byIdentity.set(languageIdentity(language), language);
        }
    }
    return [...byIdentity.values()];
}
/** Supported preferred languages the external detector cannot identify (e.g. Irish). */
export function undetectablePreferences(codes, model, preferred) {
    if (!requiresLanguageDetector(model))
        return [];
    return compatiblePreferences(model, preferred).filter((language) => detectorLanguageCode(codes, language) === undefined);
}
/**
 * Resolve Auto. Without native detection, Auto exists only when at least two
 * preferred languages are supported and every one of them is detectable.
 */
export function autoLanguagePolicy(codes, model, preferred) {
    // Native detection retains its existing unrestricted semantics.
    if (model.capabilities.languageDetection)
        return { kind: "native" };
    const languages = compatiblePreferences(model, preferred);
    const allowed = languages.map((language) => detectorLanguageCode(codes, language));
    if (languages.length < 2 || allowed.includes(undefined))
        return { kind: "unsupported" };
    return { kind: "detect", languages, allowed: allowed };
}
