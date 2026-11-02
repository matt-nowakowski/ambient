import bundled from "../../catalog.json" with { type: "json" };
import { createCatalog } from "./create.js";
export { createCatalog } from "./create.js";
export { canonicalLanguage, languageIdentity, resolveModelLanguage, } from "./languages.js";
export { catalogModelSearchText, compareEngineVersions, displayLanguage, formatBinarySize, modelFile, modelMatchesLanguage, modelsForEngine, rankCatalogModels, } from "./catalog.js";
export { requiresLanguageDetector, } from "./language-detection.js";
export { accuracyGrade, BENCHMARK_DICTATION_SECONDS, frontierModelIds, SPEED_METER_STEPS, speedMeterLevel, } from "./recommendations.js";
/**
 * The catalog bundled with this package version. TypeScript infers each
 * model's `files` as a different object shape, so the JSON only fits
 * CatalogData through unknown; generate.mjs and the tests vouch for it.
 */
export const catalog = createCatalog(bundled);
export const TRANSCRIBE_CPP_VERSION = catalog.transcribeCpp;
/** Every published model, curated or not, of every role. */
export const ALL_MODELS = catalog.models;
/** Shown by default and the only models ever recommended. */
export const CURATED_MODELS = catalog.curatedModels;
export const LANGUAGE_DETECTION_MODEL = catalog.languageDetectionModel;
export const COMFORTABLE_REAL_TIME_FACTOR = catalog.comfortableRealTimeFactor;
export const EXPERIMENTAL_MAX_ERROR_PERCENT = catalog.experimentalMaxErrorPercent;
export const { getModel, recommend, recommendModels, benchmarkModels, getPreferredRecommendationLanguages, languageAccuracyGrade, modelWaitSeconds, detectorLanguageCode, undetectablePreferences, autoLanguagePolicy, } = catalog;
