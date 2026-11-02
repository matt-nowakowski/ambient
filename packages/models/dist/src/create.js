import { modelsForEngine } from "./catalog.js";
import * as detection from "./language-detection.js";
import * as method from "./recommendations.js";
/**
 * Bind the recommendation method to one catalog. The package's top-level
 * exports are this, bound to the bundled catalog.json; call it yourself to use
 * other data (a newer catalog fetched at runtime, or a test fixture).
 */
export function createCatalog(data) {
    if (data.schema !== 2)
        throw new Error(`Unsupported catalog schema ${String(data.schema)}`);
    const byId = new Map(data.models.map((model) => [model.id, model]));
    const languageDetectionModel = byId.get(data.languageDetector);
    if (!languageDetectionModel)
        throw new Error(`Catalog has no language detector ${data.languageDetector}`);
    const context = {
        methodology: data.methodology,
        results: data.results,
        detectorCodes: detection.detectorCodes(languageDetectionModel),
    };
    const curatedModels = data.models.filter((model) => model.curated && model.role === "asr");
    return {
        data,
        /** The transcribe.cpp release this catalog was built from. */
        transcribeCpp: data.transcribeCpp,
        methodology: data.methodology,
        /** Every published model, curated or not, of every role. */
        models: data.models,
        /** Shown by default and the only models ever recommended. */
        curatedModels,
        /** The shared spoken-language detector. */
        languageDetectionModel,
        getModel: (id) => byId.get(id),
        /**
         * Best, Fast and Accurate for these languages, from the curated models
         * this engine can load. The robust default: use this unless you need to
         * recommend from a different pool.
         */
        recommend: (languages, options = {}) => method.recommendModels(context, options.engineVersion ? modelsForEngine(curatedModels, options.engineVersion) : curatedModels, languages),
        recommendModels: (models, languages) => method.recommendModels(context, models, languages),
        benchmarkModels: (models, languages) => method.benchmarkModels(context, models, languages),
        getPreferredRecommendationLanguages: (models = curatedModels) => method.getPreferredRecommendationLanguages(context, models),
        languageAccuracyGrade: (model, language) => method.languageAccuracyGrade(context, model, language),
        modelWaitSeconds: (model, tier) => method.modelWaitSeconds(context, model, tier),
        /** Wait-time cutoff used by the overall pick, as a real-time factor. */
        comfortableRealTimeFactor: method.comfortableRealTimeFactor(data.methodology),
        experimentalMaxErrorPercent: data.methodology.experimentalMaxErrorPercent,
        detectorLanguageCode: (language) => detection.detectorLanguageCode(context.detectorCodes, language),
        undetectablePreferences: (model, preferred) => detection.undetectablePreferences(context.detectorCodes, model, preferred),
        autoLanguagePolicy: (model, preferred) => detection.autoLanguagePolicy(context.detectorCodes, model, preferred),
    };
}
