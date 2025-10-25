import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CyclicDependencyError,
    makeInjectorFactory,
    type DependenciesListRecord,
    type DependencyInjectionOptions,
    type MemberProviderModule,
} from '../src/index.js';

// Utility function for asserting on logs
const increment = (map: Map<string, number>, ...keys: string[]) => {
    for (const key of keys) {
        const value = map.get(key);
        if (value) {
            map.set(key, value + 1);
        } else {
            map.set(key, 1);
        }
    }
};

test('Pythagorean triple', async (t) => {
    interface PythagoreanTriple {
        a: number;
        b: number;
        c: number;

        digest: string;
    }

    const mapExpectedLogs = new Map([
        ['digest - get', 1],
        ['a - get', 2],
        ['b - get', 2],
        ['c - get', 1],

        ['digest - constructing', 1],
        ['a - constructing', 1],
        ['b - constructing', 1],
        ['c - constructing', 1],

        ['digest - constructed', 1],
        ['a - constructed', 1],
        ['b - constructed', 1],
        ['c - constructed', 1],

        ['a - already constructed', 1],
        ['b - already constructed', 1],
    ]);

    const mapActualLogs: Map<string, number> = new Map();
    const log = (statement: string) => increment(mapActualLogs, statement);

    const PythagoreanTripleModule = makeInjectorFactory<PythagoreanTriple>()(
        {
            a: [],
            b: [],
            c: ['a', 'b'],
            digest: ['a', 'b', 'c'],
        },
        {
            a: () => 3,
            b: () => 4,
            c: ({ a, b }) => Math.round(Math.sqrt(a * a + b * b) * 100) / 100,
            digest: ({ a, b, c }) => `${a}^2 + ${b}^2 = ${c}^2`,
        },
        {
            log,
        },
    );

    await t.test('Initial', () => {
        // Assert contents are as expected
        assert.deepStrictEqual(PythagoreanTripleModule.digest, '3^2 + 4^2 = 5^2');

        // Assert correct logs are emitted
        assert.deepStrictEqual(mapActualLogs, mapExpectedLogs);
    });

    // Retrieve digest again, and assert on updated logs
    await t.test('Additional retrieval of digest', () => {
        // Re-retrieve
        assert.deepStrictEqual(PythagoreanTripleModule.digest, '3^2 + 4^2 = 5^2');

        // Increment logs based on retrieval
        increment(mapExpectedLogs, 'digest - get', 'digest - already constructed');

        // Assert correct logs are emitted, after another retrieval
        assert.deepStrictEqual(mapActualLogs, mapExpectedLogs);
    });
});

test('Cycles', async (t) => {
    /**
     * Tests demonstrating functionality to catch cycles.
     */

    const UNUSED = {} as any;

    const cycleCheckStyle: DependencyInjectionOptions['checkForCycles'][] = ['simple', 'detailed'];

    const validateCycleError = (
        err: unknown,
        style: DependencyInjectionOptions['checkForCycles'],
        expectedCycles: string[][],
    ) => {
        assert(err instanceof CyclicDependencyError);

        if (style === 'detailed') {
            assert(err.cycles !== undefined);

            const setActualCycles = new Set(err.cycles.map((cycle) => new Set(cycle)));
            const setExpectedCycles = new Set(expectedCycles.map((cycle) => new Set(cycle)));

            assert.deepStrictEqual(
                setActualCycles,
                setExpectedCycles,
                'Expected cycles content to match expected, ignoring order',
            );

            assert.deepStrictEqual(
                err.toString(),
                new CyclicDependencyError(CyclicDependencyError.STANDARD_MESSAGE, expectedCycles).toString(),
                'Expected string represntation of cycle to match expected',
            );
        } else {
            assert(err.cycles === undefined);
        }

        return true;
    };

    for (const style of cycleCheckStyle) {
        await t.test(`Self loop - ${style}`, () =>
            assert.throws(
                () =>
                    makeInjectorFactory<{ a: number }>()(
                        {
                            a: ['a'],
                        },
                        UNUSED,
                        {
                            checkForCycles: style,
                        },
                    ),
                (err) => validateCycleError(err, style, [['a']]),
            ),
        );

        await t.test(`2-way loop - ${style}`, () =>
            assert.throws(
                () =>
                    makeInjectorFactory<{ a: number; b: number }>()(
                        {
                            a: ['b'],
                            b: ['a'],
                        },
                        UNUSED,
                        {
                            checkForCycles: style,
                        },
                    ),
                (err) => validateCycleError(err, style, [['a', 'b']]),
            ),
        );

        await t.test(`3-way loop - ${style}`, () =>
            assert.throws(
                () =>
                    makeInjectorFactory<{ a: number; b: number; c: number }>()(
                        {
                            a: ['b'],
                            b: ['c'],
                            c: ['a'],
                        },
                        UNUSED,
                        {
                            checkForCycles: style,
                        },
                    ),
                (err) => validateCycleError(err, style, [['a', 'b', 'c']]),
            ),
        );

        await t.test(`SCC - ${style}`, () =>
            assert.throws(
                () =>
                    makeInjectorFactory<{
                        a: number;
                        b: number;
                        c: number;
                        d: number;
                        e: number;
                        f: number;
                        g: number;
                        h: number;
                    }>()(
                        {
                            a: ['b'],
                            b: ['c', 'e', 'f'],
                            c: ['d', 'g'],
                            d: ['c', 'h'],
                            e: ['a', 'f'],
                            f: ['g'],
                            g: ['f'],
                            h: ['d', 'g', 'h'],
                        },
                        UNUSED,
                        {
                            checkForCycles: style,
                        },
                    ),
                (err) =>
                    validateCycleError(err, style, [
                        ['a', 'b', 'e'],
                        ['f', 'g'],
                        ['c', 'd', 'h'],
                    ]),
            ),
        );

        await t.test(`SCC 2 - ${style}`, () =>
            assert.throws(
                () =>
                    makeInjectorFactory<{ a: number; b: number; c: number }>()(
                        {
                            a: ['b'],
                            b: ['c', 'a'],
                            c: ['b'],
                        },
                        UNUSED,
                        {
                            checkForCycles: style,
                        },
                    ),
                (err) => validateCycleError(err, style, [['a', 'b', 'c']]),
            ),
        );
    }
});

test('Split usage', async (t) => {
    /**
     * Test showing declaration of the interface, the dependencies, and finally the module separately, instead of all
     * inline.
     *
     * DependenciesListRecord<T> lets you define dependencies for an interface T. MemberProviderModule<T, D> takes an
     * interface T, and a dependencies list record D, which is a dependencies list record of T.
     *
     * Then to make the injector, you pass the interface T as a template type to `makeInjectorFactory`, and then pass
     * the dependencies and corresponding module into the returned factory function.
     */

    interface FooBar {
        foo: string;
        bar: string;

        combined: string;
    }

    const fooBarDependencies = {
        foo: [],
        bar: [],
        combined: ['foo', 'bar'],
    } satisfies DependenciesListRecord<FooBar>;

    const fooBraModule: MemberProviderModule<FooBar, typeof fooBarDependencies> = {
        foo: () => 'foo',
        bar: () => 'bar',
        combined: ({ foo, bar }) => `${foo}${bar}`,
    };

    const fooBarInjector = makeInjectorFactory<FooBar>()(fooBarDependencies, fooBraModule);

    assert.equal('foobar', fooBarInjector.combined);
});
