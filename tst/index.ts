import assert from 'node:assert/strict';
import test from 'node:test';

import {
    EventType,
    CyclicDependencyError,
    makeInjectorFactory,
    type DependenciesListRecord,
    type DependencyInjectionOptions,
    type Event,
    type MemberProviderModule,
} from '../src/index.js';

const verifyEvents = (listExpected: Event[], listActual: Event[]) => {
    const fullMsg = (msg: string) =>
        `${msg}. Expected: ${JSON.stringify(listExpected)}. Actual: ${JSON.stringify(listActual)}`;
    const fieldMsg = (index: number, field: string) =>
        fullMsg(`Elements at index ${index} do not match on field '${field}'`);

    assert.equal(listExpected.length, listActual.length, fullMsg('Expected and actual list lengths do not match'));

    for (let i = 0; i < listExpected.length; i = i + 1) {
        const expected = listExpected[i];
        const actual = listActual[i];

        assert.ok(expected, fullMsg(`No element for expected list element ${i}`));
        assert.ok(actual, fullMsg(`No element for actual list element ${i}`));

        assert.deepStrictEqual(expected.member, actual.member, fieldMsg(i, 'member'));
        assert.deepStrictEqual(expected.eventType, actual.eventType, fieldMsg(i, 'eventType'));
    }
};

test('Logging and basic usage', async (t) => {
    interface RightTriangle {
        a: number;
        b: number;
        c: number;

        digest: string;
    }

    const expectedEvents: Event[] = [
        { member: 'digest', eventType: EventType.CONSTRUCTING },
        { member: 'a', eventType: EventType.CONSTRUCTING },
        { member: 'a', eventType: EventType.CONSTRUCTED, msDurationConstruct: -1 },
        { member: 'b', eventType: EventType.CONSTRUCTING },
        { member: 'b', eventType: EventType.CONSTRUCTED, msDurationConstruct: -1 },
        { member: 'c', eventType: EventType.CONSTRUCTING },
        { member: 'a', eventType: EventType.ALREADY_CONSTRUCTED },
        { member: 'b', eventType: EventType.ALREADY_CONSTRUCTED },
        { member: 'c', eventType: EventType.CONSTRUCTED, msDurationConstruct: -1 },
        { member: 'digest', eventType: EventType.CONSTRUCTED, msDurationConstruct: -1 },
    ];

    const actualEvents: Event[] = [];
    const event = (event: Event) => actualEvents.push(event);

    const RightTriangleInjector = makeInjectorFactory<RightTriangle>()(
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
            event,
        },
    );

    await t.test('Initial', () => {
        // Assert contents are as expected
        assert.deepStrictEqual(RightTriangleInjector.digest, '3^2 + 4^2 = 5^2');

        // Assert correct logs are emitted
        verifyEvents(expectedEvents, actualEvents);
    });

    // Retrieve digest again, and assert on updated logs
    await t.test('Additional retrieval of digest', () => {
        // Re-retrieve
        assert.deepStrictEqual(RightTriangleInjector.digest, '3^2 + 4^2 = 5^2');

        // Increment logs based on retrieval
        // increment(mapExpectedLogs, 'digest - get', 'digest - already constructed');
        expectedEvents.push({ member: 'digest', eventType: EventType.ALREADY_CONSTRUCTED });

        // Assert correct logs are emitted, after another retrieval
        verifyEvents(expectedEvents, actualEvents);
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
                            h: ['d', 'g'],
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

        await t.test(`SCC 3 - ${style}`, () =>
            assert.throws(
                () =>
                    makeInjectorFactory<{ a: number; b: number; c: number }>()(
                        {
                            a: ['b'],
                            b: ['a'],
                            c: ['b'],
                        },
                        UNUSED,
                        {
                            checkForCycles: style,
                        },
                    ),
                (err) => validateCycleError(err, style, [['a', 'b']]),
            ),
        );
    }
});

test('Split usage', async () => {
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
