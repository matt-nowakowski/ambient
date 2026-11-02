import { type DetectorCodes } from "./language-detection.ts";
import type { CatalogModel, MachineTier, Methodology, ModelResults } from "./types.ts";
/** The data the method reads: thresholds, results, and the detector's languages. */
export type RecommendationContext = {
    readonly methodology: Methodology;
    readonly results: Readonly<Record<string, ModelResults>>;
    readonly detectorCodes: DetectorCodes;
};
export type RecommendationRole = "best" | "fast" | "accurate";
export type RecommendationStatus = "eligible" | "experimental" | "unsupported" | "unbenchmarked";
export type ModelRecommendation = {
    model: CatalogModel;
    roles: RecommendationRole[];
    status: RecommendationStatus;
    /** Geometric mean of the per-language error, in percent. */
    error?: number;
    /** Seconds after the dictation on the benchmark GPU. */
    waitSeconds?: number;
    /** Whether this model meets the Fast role's wait target on the benchmark CPU. */
    withinFastWaitTarget?: boolean;
    /** The chosen language this model handles worst. */
    worstLanguage?: string;
    /** Its measured word or character error, in percent. */
    worstError?: number;
    /** True when even the worst language is over the usability floor. */
    overFloor?: boolean;
    /** Usable, but close enough to the floor that the pane says so. */
    nearFloor?: boolean;
};
export type AccuracyLetter = "A" | "B" | "C" | "D" | "F";
export type AccuracyGrade = {
    letter: AccuracyLetter;
    /** The letter with its modifier, e.g. "A-" or "B+"; D and F carry none. */
    label: string;
};
/**
 * A compact benchmark comparison, not a prediction of editing effort. A–C
 * modifiers use proportional changes in error. Keep README.md in sync when
 * changing display bands.
 */
export declare function accuracyGrade(errorPercent: number): AccuracyGrade;
export declare const BENCHMARK_DICTATION_SECONDS = 30;
export declare const SPEED_METER_STEPS: 5;
export declare function speedMeterLevel(processingSeconds: number): number;
/** Processing time for the display's reference recording on the benchmark tier. */
export declare function modelWaitSeconds(context: RecommendationContext, model: CatalogModel, tier?: MachineTier): number | undefined;
/**
 * The model's grade for one language, or undefined when the benchmark has
 * no measurement for it (whether or not the model claims the language).
 */
export declare function languageAccuracyGrade(context: RecommendationContext, model: CatalogModel, language: string): AccuracyGrade | undefined;
/**
 * The speed the overall pick was chosen for: a dictation of
 * `dictationSeconds` back within `overallMaxWaitSeconds`. A model measured
 * below this on someone's machine misses the budget it was recommended by.
 */
export declare function comfortableRealTimeFactor(methodology: Methodology): number;
/** A model's benchmark against a set of chosen languages, for the picker. */
export type ModelBenchmark = {
    /** Geometric mean of the per-language error, in percent. */
    error: number;
    /** Seconds after the benchmark dictation on the benchmark GPU. */
    waitSeconds: number;
    /** Every chosen language is under the usability floor. */
    usable: boolean;
    /** Needs the language set by hand for this set of languages. */
    manual: boolean;
};
/**
 * Benchmarks for every model measured on all the chosen languages, keyed by
 * model id. Models that lack a language or a measurement are absent.
 */
export declare function benchmarkModels(context: RecommendationContext, models: readonly CatalogModel[], languages: readonly string[]): Map<string, ModelBenchmark>;
/**
 * The usable models on the speed/accuracy frontier: nothing usable is both
 * quicker and more accurate. Equal models both stay, so a tie never hides one.
 */
export declare function frontierModelIds(benchmarks: ReadonlyMap<string, ModelBenchmark>): Set<string>;
/**
 * Overall, fast, and accurate picks. Every role is always assigned: when no
 * other model earns the fast or accurate role, the overall pick carries it,
 * so callers can rely on all three without special cases. The picks do not
 * depend on the machine: they are judged on the benchmark rig, and the Try
 * it step measures the real wait. No languages, or a language no model
 * speaks, gets no picks.
 */
export declare function recommendModels(context: RecommendationContext, models: readonly CatalogModel[], languages: readonly string[]): ModelRecommendation[];
/**
 * Languages suitable for the recommendation-oriented preferred-language
 * picker. Experimental languages remain discoverable; unsupported and
 * unbenchmarked model-card claims stay available only in model-specific
 * language controls.
 */
export declare function getPreferredRecommendationLanguages(context: RecommendationContext, models: readonly CatalogModel[]): string[];
