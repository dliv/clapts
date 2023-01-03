import assert from 'assert'; // TODO: not browser safe

export class Limiter<T> {
    private intervalTracker: Map<string, Set<number>> = new Map();
    /**
     * Constructor is private to force use of factory method `make()`.
     * This might be enterprisey overkill but is intended to emphasise that we only
     * use `signals` and `items` to derive bounds used by this class.
     */
    private constructor(
        private readonly minTs: number,
        private readonly delta: number,
    ) {}

    static make<T>(
        signals: SignalAccumulator<T>,
        items: InternalItem[],
    ): Limiter<T> {
        const signalCount = countSignals(items, signals.bySignal);
        assert(
            signalCount > 0 &&
                // TODO: should probably trim to most recent signals rather than dying
                signalCount < signals._meta.maxSize,
            'selective add: invalid signal count',
        );

        const intervalsPerSignal = Math.floor(
            signals._meta.maxSize / signalCount,
        );
        assert(
            intervalsPerSignal > 0,
            'selective add: failed to calculate intervalsPerSignal',
        );

        const [minTs, maxTs] = getMinMaxTs(signals, items);
        assert(
            typeof minTs === 'number' &&
                typeof maxTs === 'number' &&
                Number.isFinite(minTs) &&
                Number.isFinite(maxTs) &&
                maxTs >= minTs,
            'selective add: failed to calculate min and max timestamps',
        );

        const delta = (maxTs - minTs) / intervalsPerSignal;
        assert(
            delta && Number.isFinite(delta),
            'selective add: failed to calculate delta',
        );

        return new Limiter(minTs, delta);
    }

    isUsedTime(signalId: string, time: number): boolean {
        return this.isUsedInterval(signalId, this.timeToInterval(time));
    }

    markUsedTime(signalId: string, time: number): void {
        this.markUsedInterval(signalId, this.timeToInterval(time));
    }

    private timeToInterval(time: number): number {
        const relativeTime = time - this.minTs;
        return Math.floor(relativeTime / this.delta);
    }

    private isUsedInterval(signalId: string, intervalNumber: number): boolean {
        return Boolean(this.intervalTracker.get(signalId)?.has(intervalNumber));
    }

    private markUsedInterval(signalId: string, intervalNumber: number): void {
        let signal = this.intervalTracker.get(signalId);
        if (!signal) {
            signal = new Set<number>();
            this.intervalTracker.set(signalId, signal);
        }
        signal.add(intervalNumber);
    }
}

function countSignals(newItems: InternalItem[], prior: SignalMap = {}): number {
    const seen = new Set(Object.keys(prior));
    for (const it of newItems) {
        seen.add(it.s);
    }
    return seen.size;
}

function getMinMaxTs<T>(
    signals: SignalAccumulator<T>,
    items: readonly InternalItem[] = [],
): [number | undefined, number | undefined] {
    let min: number | undefined = undefined;
    let max: number | undefined = undefined;
    for (const collection of [Object.values(signals.byId), items]) {
        min ??= collection[0]?.t;
        max ??= collection[0]?.t;
        for (const { t } of collection) {
            if (t > max) {
                max = t;
            } else if (t < min) {
                min = t;
            }
        }
    }
    return [min, max];
}
