import { canonicalLanguage, languageIdentity, resolveModelLanguage } from "./languages.js";
const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
export function displayLanguage(language) {
    // ASR catalogs conventionally use zh for Mandarin and list Cantonese as yue.
    // Make that spoken-language distinction explicit without losing the familiar
    // umbrella term users look for.
    if (canonicalLanguage(language) === "zh")
        return "Mandarin (Chinese)";
    try {
        return languageNames.of(language) ?? language;
    }
    catch {
        return language;
    }
}
export function modelMatchesLanguage(model, language) {
    return resolveModelLanguage(model, language) !== undefined;
}
function preferredLanguageMatchCount(model, preferredLanguages) {
    return [...new Set(preferredLanguages.map(languageIdentity))].filter((language) => modelMatchesLanguage(model, language)).length;
}
// The catalog carries no editorial rank or score: the pickers order measured
// models by benchmark, so names only settle models without one.
export function rankCatalogModels(models, preferredLanguages = [], isDownloaded = () => false) {
    return [...models].sort((left, right) => preferredLanguageMatchCount(right, preferredLanguages) -
        preferredLanguageMatchCount(left, preferredLanguages) ||
        Number(isDownloaded(right)) - Number(isDownloaded(left)) ||
        left.name.localeCompare(right.name));
}
/** The model's default file, `files[quant]`: the benchmarked one for curated models. */
export function modelFile(model) {
    const file = model.files[model.quant];
    if (!file)
        throw new Error(`${model.id} has no ${model.quant} file`);
    return file;
}
/**
 * What a catalog search runs against. Languages and capabilities are left
 * out on purpose: the pickers already scope and grade by language, and a
 * long haystack made short queries match nearly everything.
 */
export function catalogModelSearchText(model) {
    return [model.id, model.name, model.family, model.parameters ?? ""].join(" ").toLowerCase();
}
export function formatBinarySize(bytes) {
    if (bytes >= 1024 ** 3) {
        return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GiB`;
    }
    return `${Math.round(bytes / (1024 * 1024))} MiB`;
}
/** Compare "0.4.0"-style versions (a leading "v" is ignored). */
export function compareEngineVersions(left, right) {
    const parse = (version) => version.trim().replace(/^v/, "").split(/[.+-]/, 3).map((part) => Number.parseInt(part, 10) || 0);
    const [a, b] = [parse(left), parse(right)];
    for (let index = 0; index < 3; index++) {
        const difference = (a[index] ?? 0) - (b[index] ?? 0);
        if (difference !== 0)
            return difference;
    }
    return 0;
}
/** The models a given transcribe.cpp version can load. */
export function modelsForEngine(models, engineVersion) {
    return models.filter((model) => model.minEngine === undefined || compareEngineVersions(model.minEngine, engineVersion) <= 0);
}
