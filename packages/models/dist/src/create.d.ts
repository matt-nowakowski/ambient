import * as detection from "./language-detection.ts";
import * as method from "./recommendations.ts";
import type { CatalogData, CatalogModel, MachineTier } from "./types.ts";
export type Catalog = ReturnType<typeof createCatalog>;
/**
 * Bind the recommendation method to one catalog. The package's top-level
 * exports are this, bound to the bundled catalog.json; call it yourself to use
 * other data (a newer catalog fetched at runtime, or a test fixture).
 */
export declare function createCatalog(data: CatalogData): {
    data: CatalogData;
    /** The transcribe.cpp release this catalog was built from. */
    transcribeCpp: string;
    methodology: import("./types.ts").Methodology;
    /** Every published model, curated or not, of every role. */
    models: readonly CatalogModel[];
    /** Shown by default and the only models ever recommended. */
    curatedModels: CatalogModel[];
    /** The shared spoken-language detector. */
    languageDetectionModel: CatalogModel;
    getModel: (id: string) => CatalogModel | undefined;
    /**
     * Best, Fast and Accurate for these languages, from the curated models
     * this engine can load. The robust default: use this unless you need to
     * recommend from a different pool.
     */
    recommend: (languages: readonly string[], options?: {
        engineVersion?: string;
    }) => method.ModelRecommendation[];
    recommendModels: (models: readonly CatalogModel[], languages: readonly string[]) => method.ModelRecommendation[];
    benchmarkModels: (models: readonly CatalogModel[], languages: readonly string[]) => Map<string, method.ModelBenchmark>;
    getPreferredRecommendationLanguages: (models?: readonly CatalogModel[]) => string[];
    languageAccuracyGrade: (model: CatalogModel, language: string) => method.AccuracyGrade | undefined;
    modelWaitSeconds: (model: CatalogModel, tier?: MachineTier) => number | undefined;
    /** Wait-time cutoff used by the overall pick, as a real-time factor. */
    comfortableRealTimeFactor: number;
    experimentalMaxErrorPercent: number;
    detectorLanguageCode: (language: string) => string | undefined;
    undetectablePreferences: (model: detection.LanguageModel, preferred: readonly string[]) => string[];
    autoLanguagePolicy: (model: detection.LanguageModel, preferred: readonly string[]) => detection.AutoLanguagePolicy;
};
