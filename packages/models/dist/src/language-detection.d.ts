/** The parts of a model the language policy reads. */
export type LanguageModel = {
    readonly languages: readonly string[];
    readonly capabilities: {
        readonly languageDetection: boolean;
    };
};
export type DetectPolicy = {
    kind: "detect";
    languages: string[];
    allowed: string[];
};
/** What a take does about language. Auto is never `fixed`; `unsupported` hides it. */
export type AutoLanguagePolicy = {
    kind: "native";
} | {
    kind: "fixed";
    language: string;
} | DetectPolicy | {
    kind: "unsupported";
};
/** The external detector's labels, keyed by language identity. */
export type DetectorCodes = ReadonlyMap<string, string>;
export declare function detectorCodes(detector: {
    readonly languages: readonly string[];
}): DetectorCodes;
/** Return the detector's own label (iw/jw/tl/no included). */
export declare function detectorLanguageCode(codes: DetectorCodes, language: string): string | undefined;
/** Whether this ASR model needs the external detector for Auto, independent of preferences. */
export declare function requiresLanguageDetector(model: LanguageModel): boolean;
/** Supported preferred languages the external detector cannot identify (e.g. Irish). */
export declare function undetectablePreferences(codes: DetectorCodes, model: LanguageModel, preferred: readonly string[]): string[];
/**
 * Resolve Auto. Without native detection, Auto exists only when at least two
 * preferred languages are supported and every one of them is detectable.
 */
export declare function autoLanguagePolicy(codes: DetectorCodes, model: LanguageModel, preferred: readonly string[]): AutoLanguagePolicy;
