type SignalAccumulator<T> = {
    _meta: Meta<T>;
    byId: IdMap<InternalItem>;
    bySignal: SignalMap;
};

type Meta<T> = {
    idKey: string & keyof T;
    signalKey: string & keyof T;
    timeKey: string & keyof T;
    maxSize: number;
};

type InternalItem = {
    /**
     * The reading or most specific id (e.g. `id`, `_id`).
     */
    i: string;
    /**
     * The signal or grouping id (e.g. vehicleId)
     */
    s: string;
    /**
     * The timestamp.
     */
    t: number;
};

// avoid `Map` because we need:
// - to probably use this with Redux
// - JSON serializability
// - immutable updates with structural sharing
type IdMap<T> = { [k: string]: T };
type SignalMap = { [k: string]: string[] };
