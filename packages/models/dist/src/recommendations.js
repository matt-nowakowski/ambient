// The recommendation method, moved from Pi Voice (src/recommendations.ts at
// earendil-works/pi-voice@b5b61b1) with its behaviour unchanged. The only
// difference is that the benchmark data arrives as an argument instead of a
// module-level import, so callers can bind any catalog (see createCatalog).
import { displayLanguage, modelMatchesLanguage, rankCatalogModels } from "./catalog.js";
import { undetectablePreferences } from "./language-detection.js";
import { languageIdentity } from "./languages.js";
/** Display bands are independent of recommendation eligibility policy. */
const ACCURACY_CEILINGS = { A: 5, B: 10, C: 20, D: 30 };
/** Each sub-grade step multiplies the measured error by this. */
const SUB_GRADE_STEP = Math.cbrt(2);
/**
 * A compact benchmark comparison, not a prediction of editing effort. A–C
 * modifiers use proportional changes in error. Keep README.md in sync when
 * changing display bands.
 */
export function accuracyGrade(errorPercent) {
    if (errorPercent >= ACCURACY_CEILINGS.D)
        return { letter: "F", label: "F" };
    if (errorPercent >= ACCURACY_CEILINGS.C)
        return { letter: "D", label: "D" };
    const letters = [
        ["A", ACCURACY_CEILINGS.A],
        ["B", ACCURACY_CEILINGS.B],
        ["C", ACCURACY_CEILINGS.C],
    ];
    const [letter, ceiling] = letters.find(([, limit]) => errorPercent < limit);
    const modifier = errorPercent < ceiling / SUB_GRADE_STEP ** 2
        ? "+"
        : errorPercent < ceiling / SUB_GRADE_STEP
            ? ""
            : "-";
    return { letter, label: `${letter}${modifier}` };
}
// Display-only reference and bands; changing recommendation wait budgets must
// not silently redefine the meter.
export const BENCHMARK_DICTATION_SECONDS = 30;
const SPEED_CUTOFF_SECONDS = [1.5, 3, 5, 10, 20];
export const SPEED_METER_STEPS = SPEED_CUTOFF_SECONDS.length;
export function speedMeterLevel(processingSeconds) {
    return SPEED_CUTOFF_SECONDS.filter((cutoff) => processingSeconds < cutoff).length;
}
/** Processing time for the display's reference recording on the benchmark tier. */
export function modelWaitSeconds(context, model, tier = "accelerated") {
    const xrt = context.results[model.id]?.performance[tier];
    return xrt ? BENCHMARK_DICTATION_SECONDS / xrt : undefined;
}
/**
 * The model's grade for one language, or undefined when the benchmark has
 * no measurement for it (whether or not the model claims the language).
 */
export function languageAccuracyGrade(context, model, language) {
    const cell = context.results[model.id]?.accuracy[languageIdentity(language)];
    return cell ? accuracyGrade(cell.error) : undefined;
}
/**
 * The speed the overall pick was chosen for: a dictation of
 * `dictationSeconds` back within `overallMaxWaitSeconds`. A model measured
 * below this on someone's machine misses the budget it was recommended by.
 */
export function comfortableRealTimeFactor(methodology) {
    return methodology.dictationSeconds / methodology.overallMaxWaitSeconds;
}
function scoreModels(context, models, languages) {
    const wanted = [...new Set(languages.map(languageIdentity))];
    const method = context.methodology;
    const scored = [];
    if (wanted.length === 0)
        return scored;
    for (const model of models) {
        if (!wanted.every((language) => modelMatchesLanguage(model, language)))
            continue;
        const data = context.results[model.id];
        const cells = wanted.map((language) => data?.accuracy[language]);
        const xrt = data?.performance.accelerated;
        if (!data || !xrt || cells.some((cell) => cell === undefined))
            continue;
        const accuracyCells = cells;
        const numericErrors = accuracyCells.map((cell) => cell.error);
        const error = Math.exp(numericErrors.reduce((sum, value) => sum + Math.log(value), 0) /
            numericErrors.length);
        const waitSeconds = method.dictationSeconds / xrt;
        const cpuXrt = data.performance.cpu;
        const worstError = Math.max(...numericErrors);
        const worstIndex = numericErrors.indexOf(worstError);
        scored.push({
            model,
            error,
            worstLanguage: wanted[worstIndex],
            worstError,
            worstCiLower: accuracyCells[worstIndex].ciLower,
            waitSeconds,
            cpuWaitSeconds: cpuXrt ? method.dictationSeconds / cpuXrt : undefined,
            manual: wanted.length > 1 &&
                undetectablePreferences(context.detectorCodes, model, languages).length > 0,
            score: error + method.waitWeight * Math.max(0, waitSeconds - method.freeWaitSeconds),
        });
    }
    return scored;
}
/**
 * Benchmarks for every model measured on all the chosen languages, keyed by
 * model id. Models that lack a language or a measurement are absent.
 */
export function benchmarkModels(context, models, languages) {
    const floor = context.methodology.maxLanguageErrorPercent;
    return new Map(scoreModels(context, models, languages).map((candidate) => [
        candidate.model.id,
        {
            error: candidate.error,
            waitSeconds: candidate.waitSeconds,
            usable: candidate.worstError < floor,
            manual: candidate.manual,
        },
    ]));
}
/**
 * The usable models on the speed/accuracy frontier: nothing usable is both
 * quicker and more accurate. Equal models both stay, so a tie never hides one.
 */
export function frontierModelIds(benchmarks) {
    const usable = [...benchmarks]
        .filter(([, benchmark]) => benchmark.usable)
        .map(([id, benchmark]) => ({ id, error: benchmark.error, wait: benchmark.waitSeconds }));
    return new Set(usable
        .filter((candidate) => !usable.some((other) => other.error <= candidate.error &&
        other.wait <= candidate.wait &&
        (other.error < candidate.error || other.wait < candidate.wait)))
        .map((candidate) => candidate.id));
}
function fallbackRecommendation(context, models, languages) {
    // Only models that speak every chosen language: when none does, there is
    // nothing to recommend, rather than a model that can't help.
    const wanted = [...new Set(languages.map(languageIdentity))];
    const speaking = models.filter((model) => wanted.every((language) => modelMatchesLanguage(model, language)));
    const detecting = speaking.filter((model) => wanted.length === 1 || undetectablePreferences(context.detectorCodes, model, languages).length === 0);
    const model = rankCatalogModels(detecting.length ? detecting : speaking, wanted)[0];
    return model
        ? [{ model, roles: ["best", "fast", "accurate"], status: "unbenchmarked" }]
        : [];
}
function lowest(items, key) {
    let best;
    for (const item of items) {
        if (best === undefined || key(item) < key(best))
            best = item;
    }
    return best;
}
/**
 * Overall, fast, and accurate picks. Every role is always assigned: when no
 * other model earns the fast or accurate role, the overall pick carries it,
 * so callers can rely on all three without special cases. The picks do not
 * depend on the machine: they are judged on the benchmark rig, and the Try
 * it step measures the real wait. No languages, or a language no model
 * speaks, gets no picks.
 */
export function recommendModels(context, models, languages) {
    if (languages.length === 0)
        return [];
    const scored = scoreModels(context, models, languages);
    if (scored.length === 0)
        return fallbackRecommendation(context, models, languages);
    const method = context.methodology;
    const byError = (candidate) => candidate.error;
    // Quality outranks both latency and automatic switching. Prefer an
    // automatic model when one clears the floor, then a usable manual model.
    // Only compare over-floor models when no usable candidate exists at all.
    const withinFloor = scored.filter((candidate) => candidate.worstError < method.maxLanguageErrorPercent);
    const detectingWithinFloor = withinFloor.filter((candidate) => !candidate.manual);
    const hasUsableModel = withinFloor.length > 0;
    const pool = detectingWithinFloor.length
        ? detectingWithinFloor
        : hasUsableModel
            ? withinFloor
            : scored;
    const withinOverallBudget = pool.filter((candidate) => candidate.waitSeconds <= method.overallMaxWaitSeconds);
    const overall = hasUsableModel
        ? lowest(withinOverallBudget.length ? withinOverallBudget : pool, (candidate) => candidate.score)
        : lowest(pool, (candidate) => candidate.worstError + candidate.error / 1000);
    // Fast means the best quality inside the CPU target. If every usable model
    // misses that target, prefer the quickest usable model rather than a fast
    // model whose transcript is not useful.
    const onCpu = pool.filter((candidate) => candidate.cpuWaitSeconds !== undefined);
    const withinCpuBudget = onCpu.filter((candidate) => candidate.cpuWaitSeconds <= method.fastCpuMaxWaitSeconds);
    const fast = hasUsableModel
        ? lowest(withinCpuBudget, byError) ??
            lowest(onCpu, (candidate) => candidate.cpuWaitSeconds + candidate.error / 1000) ??
            overall
        : overall;
    const accurate = hasUsableModel
        ? lowest(pool.filter((candidate) => candidate.waitSeconds <= method.accurateMaxWaitSeconds), byError) ?? lowest(pool, byError) ?? overall
        : overall;
    const byId = new Map();
    for (const [candidate, role] of [
        [overall, "best"],
        [fast, "fast"],
        [accurate, "accurate"],
    ]) {
        const current = byId.get(candidate.model.id);
        if (current)
            current.roles.push(role);
        else {
            byId.set(candidate.model.id, {
                model: candidate.model,
                roles: [role],
                status: hasUsableModel
                    ? "eligible"
                    : candidate.worstError < method.experimentalMaxErrorPercent ||
                        (candidate.worstCiLower !== undefined && candidate.worstCiLower <= method.experimentalMaxErrorPercent)
                        ? "experimental"
                        : "unsupported",
                error: candidate.error,
                waitSeconds: candidate.waitSeconds,
                withinFastWaitTarget: candidate.cpuWaitSeconds !== undefined &&
                    candidate.cpuWaitSeconds <= method.fastCpuMaxWaitSeconds,
                worstLanguage: candidate.worstLanguage,
                worstError: candidate.worstError,
                overFloor: candidate.worstError >= method.maxLanguageErrorPercent,
                nearFloor: candidate.worstError >= method.noteMinErrorPercent &&
                    candidate.worstError < method.maxLanguageErrorPercent,
            });
        }
    }
    return [...byId.values()];
}
/**
 * Languages suitable for the recommendation-oriented preferred-language
 * picker. Experimental languages remain discoverable; unsupported and
 * unbenchmarked model-card claims stay available only in model-specific
 * language controls.
 */
export function getPreferredRecommendationLanguages(context, models) {
    const languages = new Set(models.flatMap((model) => model.languages.map(languageIdentity)));
    return [...languages]
        .filter((language) => {
        const status = recommendModels(context, models, [language])[0]?.status;
        return status === "eligible" || status === "experimental";
    })
        .sort((left, right) => {
        if (left === "en")
            return -1;
        if (right === "en")
            return 1;
        return displayLanguage(left).localeCompare(displayLanguage(right));
    });
}
