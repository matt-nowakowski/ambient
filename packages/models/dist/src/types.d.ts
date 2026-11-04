/** What a published model is for. Only `asr` models transcribe or get recommended. */
export type ModelRole = "asr" | "langid" | "vad" | "diarize" | "llm";
export type ModelFile = {
    /** Path within the repository at `revision`. */
    readonly filename: string;
    /** Exact size in bytes. */
    readonly size: number;
    /** Content hash at `revision`: the trust anchor for any download source. */
    readonly sha256: string;
};
export type CatalogModel = {
    /** Hugging Face repo name without "-gguf", e.g. "Qwen3-ASR-0.6B". Stable. */
    readonly id: string;
    readonly name: string;
    /** Editorial copy for curated models; empty for the rest. */
    readonly description: string;
    /** Hugging Face repo, e.g. "tryambientai/Qwen3-ASR-0.6B-gguf". */
    readonly repository: string;
    /** Pinned commit; download from `resolve/<revision>/<filename>`. */
    readonly revision: string;
    /**
     * Revisions shipped before `revision`, most recently replaced first. A
     * download at one of these may have identical bytes after a relocation;
     * compare hashes before treating it as a model update. One at neither
     * is not a revision shipped by this catalog.
     */
    readonly previousRevisions: readonly string[];
    /** SPDX id, or "other". */
    readonly license: string;
    /** The loader architecture (the GGUF's general.architecture). */
    readonly family: string;
    readonly parameters: string | null;
    /** Language codes in the model's own spelling. */
    readonly languages: readonly string[];
    readonly capabilities: {
        readonly streaming: boolean;
        readonly translate: boolean;
        readonly languageDetection: boolean;
        /** Can return word or segment timestamps. */
        readonly timestamps: boolean;
    };
    /** The default file's key in `files`: always the benchmarked quant for curated models. */
    readonly quant: string;
    readonly role: ModelRole;
    /** Shown by default and eligible for recommendations. */
    readonly curated: boolean;
    /** Oldest transcribe.cpp release that publishes these exact files. */
    readonly minEngine?: string;
    /** Every published file by quant, the default included. */
    readonly files: Readonly<Record<string, ModelFile>>;
};
/**
 * The picks in plain words. Wait is the seconds after a dictation of
 * `dictationSeconds`, on the benchmark GPU unless said otherwise. When
 * several languages were chosen, automatic switching is preferred, but a
 * usable manual model beats an automatic model over the error floor. Quality
 * is a hard constraint whenever any model stays under
 * `maxLanguageErrorPercent` on every chosen language. The overall pick has
 * the lowest error plus wait penalty, where the first `freeWaitSeconds` cost
 * nothing and each second beyond costs `waitWeight` points; its
 * `overallMaxWaitSeconds` limit relaxes before quality does. The fast pick is
 * judged on the benchmark CPU: the most accurate usable model within
 * `fastCpuMaxWaitSeconds`, else the quickest usable model. The most accurate
 * pick has the lowest error among usable models within
 * `accurateMaxWaitSeconds`, else the most accurate usable model. When no
 * usable model exists, the closest model carries every role. It remains
 * experimental below `experimentalMaxErrorPercent`, or when its lower
 * confidence bound reaches that cutoff; otherwise it is unsupported. A pick
 * that is usable but reaches `noteMinErrorPercent` on some chosen language is
 * still recommended, with the shortfall named rather than left to be
 * discovered: the usable band spans most of an order of magnitude, so silence
 * across all of it would say the same thing about very different models.
 */
export type Methodology = {
    readonly dictationSeconds: number;
    readonly freeWaitSeconds: number;
    readonly waitWeight: number;
    readonly overallMaxWaitSeconds: number;
    readonly maxLanguageErrorPercent: number;
    readonly noteMinErrorPercent: number;
    readonly experimentalMaxErrorPercent: number;
    readonly fastCpuMaxWaitSeconds: number;
    readonly accurateMaxWaitSeconds: number;
};
export type MachineTier = "accelerated" | "cpu";
export type AccuracyCell = {
    /** Word or character error, in percent. */
    readonly error: number;
    /** Lower bound of the 95% confidence interval, when measured. */
    readonly ciLower?: number;
};
export type ModelResults = {
    /** Keyed by language identity (see languageIdentity). */
    readonly accuracy: Readonly<Record<string, AccuracyCell>>;
    /** Real-time factor on each benchmark tier. */
    readonly performance: Readonly<Partial<Record<MachineTier, number>>>;
};
/** The shape of catalog.json. */
export type CatalogData = {
    readonly schema: 2;
    /** The transcribe.cpp release the facts and benchmarks come from. */
    readonly transcribeCpp: string;
    readonly methodology: Methodology;
    readonly benchmarks: unknown;
    /** Id of the shared spoken-language detector. */
    readonly languageDetector: string;
    /** Id of the optional on-device reasoning model (role `llm`), run by llama.cpp, not transcribe.cpp. */
    readonly reasoningModel?: string;
    /** Every published model: curated first, then the rest by id. */
    readonly models: readonly CatalogModel[];
    /** Benchmark results keyed by model id. */
    readonly results: Readonly<Record<string, ModelResults>>;
};
