import assert from 'node:assert/strict';
import test from 'node:test';

import { makeModule, makeInjectorFactory, type DependenciesListRecord } from '../src/index.js';

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
        ['Get digest', 1],
        ['Get a', 2],
        ['Get b', 2],
        ['Get c', 1],

        ['Member digest not found in map. Constructing...', 1],
        ['Member a not found in map. Constructing...', 1],
        ['Member b not found in map. Constructing...', 1],
        ['Member c not found in map. Constructing...', 1],

        ['Member digest constructed and saved to map', 1],
        ['Member a constructed and saved to map', 1],
        ['Member b constructed and saved to map', 1],
        ['Member c constructed and saved to map', 1],

        ['Found member a in map', 1],
        ['Found member b in map', 1],
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
        const _ = PythagoreanTripleModule.digest;
        increment(mapExpectedLogs, 'Get digest', 'Found member digest in map');

        // Assert correct logs are emitted, after another retrieval
        assert.deepStrictEqual(mapActualLogs, mapExpectedLogs);
    });
});

test('Cycles', async (t) => {
    interface ABCs {
        a: number;
        b: number;
        c: number;
    }

    const ONE = () => 1;

    const makeABCs = makeInjectorFactory<ABCs>();

    await t.test('Self loop', () =>
        assert.throws(() =>
            makeABCs(
                {
                    a: ['a'],
                    b: ['b'],
                    c: ['c'],
                },
                {
                    a: ONE,
                    b: ONE,
                    c: ONE,
                },
                {
                    checkForCycles: true,
                },
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
                {
                    a: ONE,
                    b: ONE,
                    c: ONE,
                },
                {
                    checkForCycles: true,
                },
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
                {
                    a: ONE,
                    b: ONE,
                    c: ONE,
                },
                {
                    checkForCycles: true,
                },
            ),
        ),
    );
});

test('Split usage', async (t) => {
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

    const fooBraModule = makeModule<FooBar, typeof fooBarDependencies>({
        foo: () => 'foo',
        bar: () => 'bar',
        combined: ({ foo, bar }) => `${foo}${bar}`,
    });

    const fooBarInjector = makeInjectorFactory<FooBar>()(fooBarDependencies, fooBraModule);

    assert.equal('foobar', fooBarInjector.combined);
});
