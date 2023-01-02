type SignalAccumulator<T> = {
    _meta: Meta<T>;
    byId: IdMap<T>;
    bySignal: SignalMap;
    size: number;
    minTs: number | null;
    maxTs: number | null;
};

type Meta<T> = {
    idKey: string & keyof T;
    signalKey: string & keyof T;
    timeKey: string & keyof T;
    maxSize: number;
};

/**
 * Maps the signal / entity-type id to the matching subset (array) of items.
 *
 * Avoid a real `Map` because we nedd:
 * - to maybe use this with Redux
 * - JSON serializability
 * - immutable updates with structural sharing
 */
type SignalMap = { [k: string]: string[] };
type IdMap<T> = { [k: string]: T };

/**
 * Initial method for creating a time series accumulator.
 * @param items
 * @param _meta
 * @returns A structure that can be converted to renderable items with `toArray()` or extended
 *  with new data points via `add()`.
 */
export function toSignals<T>(
    items: readonly T[],
    _meta: Meta<T>,
): SignalAccumulator<T> {
    const init: SignalAccumulator<T> = {
        _meta,
        byId: {},
        bySignal: {},
        size: 0,
        minTs: null,
        maxTs: null,
    };
    return add(init, items);
}

export function add<T>(
    signals: SignalAccumulator<T>,
    items: readonly T[],
): SignalAccumulator<T> {
    const { idKey, signalKey, timeKey, maxSize } = signals._meta;
    let byId = { ...signals.byId };
    const bySignal = { ...signals.bySignal };
    let size = signals.size;
    const selectiveAdd = signals.size + items.length > maxSize;
    const signalCount = countSignals(signals, items);
    const intervalsPerSignal =
        selectiveAdd && signalCount > 0
            ? Math.floor(maxSize / signalCount)
            : null;
    const signalIntervalTracker: Map<string, Set<number>> = new Map();
    const [minTs, maxTs] = getMinMaxTs(signals, items);
    const delta =
        // TODO: excessive runtime checks all over the place
        // maybe we need to filter and map `items` to something static and safer
        typeof maxTs === 'number' &&
        typeof minTs === 'number' &&
        typeof intervalsPerSignal === 'number'
            ? (maxTs - minTs) / intervalsPerSignal
            : null;

    // TODO: DRY with main loop below
    // when we would exceed the max size
    // reduce the initial state to one item per signal per time chunk
    if (
        selectiveAdd &&
        typeof delta === 'number' &&
        typeof minTs === 'number'
    ) {
        size = 0;
        const newById: typeof byId = {};
        for (const [signal, itemIds] of Object.entries(bySignal)) {
            bySignal[signal] = [];
            for (const id of itemIds) {
                const item = byId[id];
                const ts = item?.[timeKey];
                if (!(item && typeof ts === 'number')) {
                    continue;
                }
                const relativeTime = ts - minTs;
                const interval = Math.floor(relativeTime / delta);
                let intervalTracker = signalIntervalTracker.get(signal);
                if (!intervalTracker) {
                    intervalTracker = new Set<number>();
                    signalIntervalTracker.set(signal, intervalTracker);
                }
                if (!intervalTracker.has(interval)) {
                    intervalTracker.add(interval);
                    bySignal[signal].push(id);
                    newById[id] = item;
                    ++size;
                }
            }
        }
        byId = newById;
    }

    for (const i of items) {
        const signal = i[signalKey];
        const id = i[idKey];
        const ts = i[timeKey];
        if (
            !(
                typeof signal === 'string' &&
                typeof id === 'string' &&
                typeof ts === 'number'
            ) ||
            byId[id]
        ) {
            continue;
        }

        // if these items would make the new collection exceed max size
        // limit (by `continue`) to one add per signal per time chunk
        // TODO: keep last point instead of first in each chunk
        if (selectiveAdd) {
            if (typeof delta !== 'number' || typeof minTs !== 'number') {
                continue;
            }
            const relativeTime = ts - minTs;
            const interval = Math.floor(relativeTime / delta);
            let intervalTracker = signalIntervalTracker.get(signal);
            if (!intervalTracker) {
                intervalTracker = new Set<number>();
                signalIntervalTracker.set(signal, intervalTracker);
            }
            if (intervalTracker.has(interval)) {
                continue;
            } else {
                intervalTracker.add(interval);
            }
        }

        byId[id] = i;
        const sig = (bySignal[signal] ??= []);
        sig.push(id);
        ++size;
    }
    return {
        _meta: { ...signals._meta },
        byId,
        bySignal,
        size,
        minTs,
        maxTs,
    };
}

function countSignals<T>(
    signals: SignalAccumulator<T>,
    items: readonly T[],
): number {
    const { signalKey } = signals._meta;
    const seen = new Set(Object.keys(signals.bySignal));
    for (const i of items) {
        const sig = i[signalKey];
        if (typeof sig === 'string') {
            seen.add(sig);
        }
    }
    return seen.size;
}

function getMinMaxTs<T>(
    signals: SignalAccumulator<T>,
    items: readonly T[],
): [number | null, number | null] {
    const { timeKey } = signals._meta;
    let minTs = signals.minTs;
    let maxTs = signals.maxTs;
    for (const i of items) {
        const ts = i[timeKey];
        if (typeof ts !== 'number') {
            continue;
        }
        if (maxTs === null || ts > maxTs) {
            maxTs = ts;
        }
        if (minTs === null || ts < minTs) {
            minTs = ts;
        }
    }
    return [minTs, maxTs];
}

export function toArray<T>(accum: SignalAccumulator<T>): T[] {
    return Object.values(accum.byId);
}
