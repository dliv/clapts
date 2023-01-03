import { add, toInternalArray, toSignals } from './time-series';

describe('time-series-set', () => {
    const el = (vehicleId: string, readingId: string, time?: number) => ({
        i: readingId,
        s: vehicleId,
        t: time ?? 1,
    });

    describe('toSignals and toArray', () => {
        const initData = Object.freeze([
            el('...-632d-...', 'a'),
            el('...-4e7b-...', 'b'),
            el('...-632d-...', 'c'),
            el('...-632d-...', 'd'),
            el('...-632d-...', 'e'),
            el('...-632d-...', 'f'),
            el('...-4e7b-...', 'g'),
            el('...-632d-...', 'h'),
            el('...-632d-...', 'i'),
            el('...-632d-...', 'j'),
            el('...-632d-...', 'j'), // duplicate
            el('...-632d-...', 'k'),
            // @ts-expect-error not string
            el(true, 'z'),
            // @ts-expect-error not string
            el('...-632d-...', { foo: 'bar' }),
            el('...-632d-...', 'l'),
        ]);

        describe('toSignals', () => {
            it('works', () => {
                const signals = toSignals(
                    {
                        idKey: 'i',
                        signalKey: 's',
                        timeKey: 't',
                        maxSize: 1_000,
                    },
                    initData,
                );
                expect(signals).toEqual({
                    _meta: {
                        idKey: 'i',
                        signalKey: 's',
                        timeKey: 't',
                        maxSize: 1_000,
                    },
                    bySignal: {
                        '...-632d-...': 'acdefhijkl'.split(''),
                        '...-4e7b-...': 'bg'.split(''),
                    },
                    byId: {
                        a: initData[0],
                        b: initData[1],
                        c: initData[2],
                        d: initData[3],
                        e: initData[4],
                        f: initData[5],
                        g: initData[6],
                        h: initData[7],
                        i: initData[8],
                        j: initData[9],
                        // 10 is duplicate
                        k: initData[11],
                        // 12 and 13 are invalid
                        l: initData[14],
                    },
                });
            });
        });

        describe('toArray', () => {
            it('works', () => {
                const signals = toSignals(
                    {
                        idKey: 'i',
                        signalKey: 's',
                        timeKey: 't',
                        maxSize: 1_000,
                    },
                    initData,
                );
                const arr = toInternalArray(signals);
                // index 10 is a duplicate, 12 and 13 are invalid
                expect(arr).toHaveLength(initData.length - 3);
                expect(arr).toEqual([
                    ...initData.slice(0, 10),
                    initData[11],
                    initData[14],
                ]);
            });
        });
    });

    describe('add', () => {
        it('works', () => {
            const initData = [
                el('cabF', 'f1'),
                el('cabF', 'f2'),
                el('cabF', 'f3'),
                el('cabB', 'b1'),
            ];
            const newData = [
                el('cabF', 'f1'),
                el('cabF', 'f4'),
                el('cabB', 'b2'),
                el('new', 'n1'),
            ];
            const newerData = [el('cabB', 'b3'), el('more', 'm1')];
            // TODO: would be cleaner with pipeline |>
            // wrap in a class that tracks accum and can call `add` without passing accum
            const all = add(
                add(
                    toSignals(
                        {
                            idKey: 'i',
                            signalKey: 's',
                            timeKey: 't',
                            maxSize: 1_000,
                        },
                        initData,
                    ),
                    newData,
                ),
                newerData,
            );
            expect(all.bySignal).toEqual({
                cabF: 'f1,f2,f3,f4'.split(','),
                cabB: 'b1,b2,b3'.split(','),
                new: 'n1'.split(','),
                more: 'm1'.split(','),
            });
        });

        it('works when size exceeds max', () => {
            const initData = Object.freeze([
                el('cabF', 'f0', 100),
                el('cabF', 'f1', 100),
                el('cabF', 'f2', 100),
                el('cabF', 'f3', 100),
                el('cabF', 'f4', 100),
                el('cabF', 'f5', 110),
                el('cabF', 'f6', 500),
                el('cabF', 'f7', 500),
                el('cabF', 'f8', 510),
                el('cabF', 'f9', 600),
                el('cabB', 'b0', 0),
                el('cabB', 'b1', 100),
                el('cabB', 'b2', 200),
                el('cabB', 'b3', 300),
                el('cabB', 'b4', 400),
                el('cabB', 'b5', 500),
                el('cabB', 'b6', 600),
                el('cabB', 'b7', 700),
                el('cabB', 'b8', 800),
                el('cabB', 'b9', 900),
            ]);
            const signals = toSignals(
                {
                    idKey: 'i',
                    signalKey: 's',
                    timeKey: 't',
                    maxSize: initData.length,
                },
                initData,
            );
            expect(Object.keys(signals.byId)).toHaveLength(initData.length);
            const updatedSignals = add(signals, [
                el('cabF', 'f10', 600),
                el('cabF', 'f11', 600),
                el('cabF', 'f11', 600),
                el('cabF', 'f12', 600),
                el('cabF', 'f13', 600),
                el('cabF', 'f14', 900),
                el('cabF', 'f15', 1_600),
                el('cabB', 'b10', 100),
                el('cabB', 'b11', 100),
                el('cabB', 'b12', 100),
                el('cabB', 'b13', 1_000),
                el('cabB', 'b14', 1_001),
                el('cabB', 'b15', 2_000),
            ]);
            expect(Object.keys(updatedSignals.byId).length).toBeLessThanOrEqual(
                initData.length,
            );
            expect(updatedSignals.bySignal).toEqual({
                cabB: 'b0,b2,b4,b6,b8,b13,b15'.split(','),
                cabF: 'f0,f6,f9,f14,f15'.split(','),
            });
            expect(
                toInternalArray(updatedSignals).filter((it) => it.s === 'cabF'),
            ).toEqual([
                el('cabF', 'f0', 100),
                // el('cabF', 'f1', 100),
                // el('cabF', 'f2', 100),
                // el('cabF', 'f3', 100),
                // el('cabF', 'f4', 100),
                // el('cabF', 'f5', 110),
                el('cabF', 'f6', 500),
                // el('cabF', 'f7', 500),
                // el('cabF', 'f8', 510),
                el('cabF', 'f9', 600),
                // el('cabF', 'f10', 600),
                // el('cabF', 'f11', 600),
                // el('cabF', 'f11', 600),
                // el('cabF', 'f12', 600),
                // el('cabF', 'f13', 600),
                el('cabF', 'f14', 900),
                el('cabF', 'f15', 1_600),
            ]);
            expect(
                toInternalArray(updatedSignals).filter((it) => it.s === 'cabB'),
            ).toEqual([
                el('cabB', 'b0', 0),
                // el('cabB', 'b1', 100),
                el('cabB', 'b2', 200),
                // el('cabB', 'b3', 300),
                el('cabB', 'b4', 400),
                // el('cabB', 'b5', 500),
                el('cabB', 'b6', 600),
                // el('cabB', 'b7', 700),
                el('cabB', 'b8', 800),
                // el('cabB', 'b9', 900),
                // el('cabB', 'b10', 100),
                // el('cabB', 'b11', 100),
                // el('cabB', 'b12', 100),
                el('cabB', 'b13', 1_000),
                // el('cabB', 'b14', 1_001),
                el('cabB', 'b15', 2_000),
            ]);
        });
    });
});
