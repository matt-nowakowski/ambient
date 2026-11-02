import type { CatalogModel, ModelFile } from "./types.ts";
export declare function displayLanguage(language: string): string;
export declare function modelMatchesLanguage(model: {
    readonly languages: readonly string[];
}, language: string): boolean;
export declare function rankCatalogModels(models: readonly CatalogModel[], preferredLanguages?: readonly string[], isDownloaded?: (model: CatalogModel) => boolean): CatalogModel[];
/** The model's default file, `files[quant]`: the benchmarked one for curated models. */
export declare function modelFile(model: CatalogModel): ModelFile;
/**
 * What a catalog search runs against. Languages and capabilities are left
 * out on purpose: the pickers already scope and grade by language, and a
 * long haystack made short queries match nearly everything.
 */
export declare function catalogModelSearchText(model: CatalogModel): string;
export declare function formatBinarySize(bytes: number): string;
/** Compare "0.4.0"-style versions (a leading "v" is ignored). */
export declare function compareEngineVersions(left: string, right: string): number;
/** The models a given transcribe.cpp version can load. */
export declare function modelsForEngine<T extends {
    readonly minEngine?: string;
}>(models: readonly T[], engineVersion: string): T[];
