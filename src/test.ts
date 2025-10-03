import assert from 'node:assert/strict';
import test from 'node:test';

import { makeDIModuleFactory } from './index.js';

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

interface TriangleInfo {
    a: number;
    b: number;
    c: number;

    digest: string;
}

const triangleModuleFactory = makeDIModuleFactory<TriangleInfo>();

const makeTriangleModule = (log?: (statement: string) => void) =>
    triangleModuleFactory(
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

test('Triangle module', async (t) => {
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
    const TriangleModule = makeTriangleModule((statement) => increment(mapActualLogs, statement));

    await t.test('initial', () => {
        // Assert contents are as expected
        assert.deepStrictEqual(TriangleModule.digest, '3^2 + 4^2 = 5^2');

        // Assert correct logs are emitted
        assert.deepStrictEqual(mapActualLogs, mapExpectedLogs);
    });

    // Retrieve digest again, and assert on updated logs
    await t.test('additional retrieval of digest', () => {
        const _ = TriangleModule.digest;
        increment(mapExpectedLogs, 'Get digest', 'Found member digest in map');

        // Assert correct logs are emitted, after another retrieval
        assert.deepStrictEqual(mapActualLogs, mapExpectedLogs);
    });
});
