/** A base code, without changing the identity or the model's exact code. */
export declare function canonicalLanguage(language: string): string;
export declare function languageIdentity(language: string): string;
/** Return a model's exact code, preserving an explicitly chosen regional variant. */
export declare function resolveModelLanguage(model: {
    readonly languages: readonly string[];
}, language: string): string | undefined;
