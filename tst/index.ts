import assert from 'node:assert/strict';
import test from 'node:test';

import { makeInjectorFactory, type DependenciesListRecord, type MemberProviderModule } from '../src/index.js';

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

    const makePythagoreanTripleModule = makeInjectorFactory<PythagoreanTriple>();

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

    const PythagoreanTripleModule = makePythagoreanTripleModule(
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
     * Tests demonstrating functionality to catch cycles. Currently, the moment when a cycle is caught, an exception
     * is thrown, without further exploring the dependency graph for any other cycles.
     */

    interface ABCs {
        a: number;
        b: number;
        c: number;
    }

    interface ABCDEFGH {
        a: number;
        b: number;
        c: number;
        d: number;
        e: number;
        f: number;
        g: number;
        h: number;
    }

    const UNUSED = {} as any;

    const makeABCs = makeInjectorFactory<ABCs>();
    const makeABCDEFGH = makeInjectorFactory<ABCDEFGH>();

    await t.test('Self loop', () =>
        assert.throws(() =>
            makeABCs(
                {
                    a: ['a'],
                    b: ['b'],
                    c: ['c'],
                },
                UNUSED,
            ),
        ),
    );

    await t.test('2-way loop', () =>
        assert.throws(() =>
            makeABCs(
                {
                    a: ['b'],
                    b: ['a'],
                    c: [],
                },
                UNUSED,
            ),
        ),
    );

    await t.test('3-way loop', () =>
        assert.throws(() =>
            makeABCs(
                {
                    a: ['b'],
                    b: ['c'],
                    c: ['a'],
                },
                UNUSED,
            ),
        ),
    );

    await t.test('DSA 3 ed 616', () =>
        assert.throws(() =>
            makeABCDEFGH(
                {
                    a: ['b'],
                    b: ['c', 'f'],
                    c: ['d', 'g'],
                    d: ['c', 'h'],
                    e: ['a', 'f'],
                    f: ['g'],
                    g: ['f', 'h'],
                    h: ['h'],
                },
                UNUSED,
            ),
        ),
    );
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
