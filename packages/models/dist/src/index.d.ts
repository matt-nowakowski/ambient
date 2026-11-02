import type { CatalogData } from "./types.ts";
export type * from "./types.ts";
export { createCatalog, type Catalog } from "./create.ts";
export { canonicalLanguage, languageIdentity, resolveModelLanguage, } from "./languages.ts";
export { catalogModelSearchText, compareEngineVersions, displayLanguage, formatBinarySize, modelFile, modelMatchesLanguage, modelsForEngine, rankCatalogModels, } from "./catalog.ts";
export { requiresLanguageDetector, type AutoLanguagePolicy, type DetectPolicy, type LanguageModel, } from "./language-detection.ts";
export { accuracyGrade, BENCHMARK_DICTATION_SECONDS, frontierModelIds, SPEED_METER_STEPS, speedMeterLevel, type AccuracyGrade, type AccuracyLetter, type ModelBenchmark, type ModelRecommendation, type RecommendationRole, type RecommendationStatus, } from "./recommendations.ts";
/**
 * The catalog bundled with this package version. TypeScript infers each
 * model's `files` as a different object shape, so the JSON only fits
 * CatalogData through unknown; generate.mjs and the tests vouch for it.
 */
export declare const catalog: {
    data: CatalogData;
    transcribeCpp: string;
    methodology: import("./types.ts").Methodology;
    models: readonly import("./types.ts").CatalogModel[];
    curatedModels: import("./types.ts").CatalogModel[];
    languageDetectionModel: import("./types.ts").CatalogModel;
    getModel: (id: string) => import("./types.ts").CatalogModel | undefined;
    recommend: (languages: readonly string[], options?: {
        engineVersion?: string;
    }) => import("./recommendations.ts").ModelRecommendation[];
    recommendModels: (models: readonly import("./types.ts").CatalogModel[], languages: readonly string[]) => import("./recommendations.ts").ModelRecommendation[];
    benchmarkModels: (models: readonly import("./types.ts").CatalogModel[], languages: readonly string[]) => Map<string, import("./recommendations.ts").ModelBenchmark>;
    getPreferredRecommendationLanguages: (models?: readonly import("./types.ts").CatalogModel[]) => string[];
    languageAccuracyGrade: (model: import("./types.ts").CatalogModel, language: string) => import("./recommendations.ts").AccuracyGrade | undefined;
    modelWaitSeconds: (model: import("./types.ts").CatalogModel, tier?: import("./types.ts").MachineTier) => number | undefined;
    comfortableRealTimeFactor: number;
    experimentalMaxErrorPercent: number;
    detectorLanguageCode: (language: string) => string | undefined;
    undetectablePreferences: (model: import("./language-detection.ts").LanguageModel, preferred: readonly string[]) => string[];
    autoLanguagePolicy: (model: import("./language-detection.ts").LanguageModel, preferred: readonly string[]) => import("./language-detection.ts").AutoLanguagePolicy;
};
export declare const TRANSCRIBE_CPP_VERSION: string;
/** Every published model, curated or not, of every role. */
export declare const ALL_MODELS: readonly import("./types.ts").CatalogModel[];
/** Shown by default and the only models ever recommended. */
export declare const CURATED_MODELS: import("./types.ts").CatalogModel[];
export declare const LANGUAGE_DETECTION_MODEL: import("./types.ts").CatalogModel;
export declare const COMFORTABLE_REAL_TIME_FACTOR: number;
export declare const EXPERIMENTAL_MAX_ERROR_PERCENT: number;
export declare const getModel: (id: string) => import("./types.ts").CatalogModel | undefined, recommend: (languages: readonly string[], options?: {
    engineVersion?: string;
}) => import("./recommendations.ts").ModelRecommendation[], recommendModels: (models: readonly import("./types.ts").CatalogModel[], languages: readonly string[]) => import("./recommendations.ts").ModelRecommendation[], benchmarkModels: (models: readonly import("./types.ts").CatalogModel[], languages: readonly string[]) => Map<string, import("./recommendations.ts").ModelBenchmark>, getPreferredRecommendationLanguages: (models?: readonly import("./types.ts").CatalogModel[]) => string[], languageAccuracyGrade: (model: import("./types.ts").CatalogModel, language: string) => import("./recommendations.ts").AccuracyGrade | undefined, modelWaitSeconds: (model: import("./types.ts").CatalogModel, tier?: import("./types.ts").MachineTier) => number | undefined, detectorLanguageCode: (language: string) => string | undefined, undetectablePreferences: (model: import("./language-detection.ts").LanguageModel, preferred: readonly string[]) => string[], autoLanguagePolicy: (model: import("./language-detection.ts").LanguageModel, preferred: readonly string[]) => import("./language-detection.ts").AutoLanguagePolicy;
