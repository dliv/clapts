import assert from 'assert'; // TODO: not browser safe

import { Limiter } from './limiter';

function newSignalAccum<T>(_meta: Meta<T>): SignalAccumulator<T> {
    return {
        _meta,
        byId: {},
        bySignal: {},
    };
}

export function toSignals<T>(
    meta: Meta<T>,
    items: readonly T[],
): SignalAccumulator<T> {
    return add(newSignalAccum(meta), items);
}

export function add<T>(
    signals: SignalAccumulator<T>,
    rawItems: readonly T[],
): SignalAccumulator<T> {
    const items = mapFilterItems(signals._meta, rawItems);
    if (items.length < 1) {
        return newSignalAccum(signals._meta);
    }

    let byId = { ...signals.byId };
    const bySignal = { ...signals.bySignal };

    const limiter =
        getSize(signals, items) > signals._meta.maxSize
            ? Limiter.make(signals, items)
            : null;

    // thin the previous data when we have too many items
    if (limiter) {
        const newById: typeof byId = {};
        for (const [signal, itemIds] of Object.entries(bySignal)) {
            bySignal[signal] = [];
            for (const id of itemIds) {
                const item = byId[id];
                if (item && !limiter.isUsedTime(signal, item.t)) {
                    limiter.markUsedTime(signal, item.t);
                    bySignal[signal].push(id);
                    newById[id] = item;
                }
            }
        }
        byId = newById;
    }

    // add new items, TODO: rewrite to be less cyclomatic-goto-shitty
    for (const it of items) {
        // the "new" items may intersect with the existing items
        if (byId[it.i]) {
            continue;
        }

        // thin (via `continue`) the new data when we have too many items
        // TODO: keep last point instead of first in each chunk
        if (limiter) {
            if (!limiter.isUsedTime(it.s, it.t)) {
                limiter.markUsedTime(it.s, it.t);
            } else {
                continue;
            }
        }

        byId[it.i] = it;
        const sig = (bySignal[it.s] ??= []);
        sig.push(it.i);
    }

    return {
        _meta: { ...signals._meta },
        byId,
        bySignal,
    };
}

function mapFilterItems<T>(
    { idKey, signalKey, timeKey }: Meta<T>,
    items: readonly T[],
): InternalItem[] {
    const cleanItems: InternalItem[] = [];
    for (const it of items) {
        const s = it[signalKey];
        const i = it[idKey];
        const t = it[timeKey];
        if (
            s &&
            typeof s === 'string' &&
            i &&
            typeof i === 'string' &&
            typeof t === 'number' && // redundant with `Number.isFinite` but appease TS
            Number.isFinite(t)
        ) {
            cleanItems.push({ s, i, t });
        }
    }
    return cleanItems;
}

function getSize<T>(
    signals: SignalAccumulator<T>,
    newItems: InternalItem[] = [],
): number {
    const prevSizeBySignal = Object.values(signals.bySignal).reduce(
        (accum, ids) => accum + ids.length,
        0,
    );
    const prevSizeById = Object.keys(signals.byId).length;
    assert(
        prevSizeBySignal === prevSizeById,
        `unequal sizes bySignal ${prevSizeBySignal} and byId ${prevSizeById}`,
    );
    return prevSizeBySignal + newItems.length;
}

export function toInternalArray<T>(
    accum: SignalAccumulator<T>,
): InternalItem[] {
    return Object.values(accum.byId);
}
