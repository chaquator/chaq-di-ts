# chaq-di-ts

Relatively lightweight dependency injection tool

## Requirements

-   TypeScript ^5.9.3
-   ES2019 or later

## Usage

### Terminology

-   Interface - Collection of objects, deonated by a unique name and a type, that have some dependency on each other
    in order to be constructed
-   Members - Individual object in a interface, has a unique name and a type
-   Dependencies - For a given member, a list of other members which need to be constructed first, as this member
    requires them during its creation
-   Module - Instructions describing how to construct each member given its dependencies
-   Injector - Finished implementation of interface which constructs members based on the provided module

### Basic usage

```TypeScript
// Specify an interface
interface PythagoreanTriple {
    a: number;
    b: number;
    c: number;

    digest: string;
}

// Create injector "factory"
// This pattern is due to TypeScript not allowing partial type arguments, with the rest being deduced
const makePythagoreanTripleInjector = makeInjectorFactory<PythagoreanTriple>();

// Create an injector by specifying dependencies and then the module based on dependencies
const PythagoreanTripleInjector = makePythagoreanTripleInjector(
    {
        a: [],
        b: [],
        c: ['a', 'b'],
        digest: ['a', 'b', 'c'],
    },
    {
        a: () => 3,
        b: () => 4,
        c: ({ a, b }) => Math.sqrt(a * a + b * b),
        digest: ({ a, b, c }) => `${a}^2 + ${b}^2 = ${c}^2`,
    },
);

// Get member from newly created injector, all of its dependencies will be lazily constructed too
console.log(PythagoreanTripleInjector.digest);

// Log output:
// 3^2 + 4^2 = 5^2
```

### Checking for cycles

By default, the dependencies passed into the injector factory will be checked for cycles. If a cycle is found, a
`CyclicDependencyError` will be thrown.

```TypeScript
interface FooBar {
    foo: Foo;
    bar: Bar;
};

// Skipping specifying module for example
const UNUSED = {} as any;

// Will throw `CyclicDependencyError`
const FooBarInjector = makeInjectorFactory<FooBar>()(
    {
        foo: ['bar'],
        bar: ['foo'],
    },
    UNUSED,
);
```

If you wish to skip the cycle check, it can be turned off by specifying in the options, during injector creation.

```TypeScript
// Will not throw, but trying to use `foo` or `bar` from `FooBarInjector`
// results in an endless loop, and eventual stack overflow.
const FooBarInjector = makeInjectorFactory<FooBar>()(
    {
        foo: ['bar'],
        bar: ['foo'],
    },
    UNUSED,
    {
        checkForCycles: 'skip',
    }
);
```

If you wish to see more details on where the cycle is, you can specify `detailed` for the `checkForCycles` option.

```TypeScript
interface ABCs {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
    g: number;
}

try {
    const ABCsInjector = makeInjectorFactory<ABCs>()(
        {
            // Three-way cycle loop between `a`, `b`, and `c`
            a: ['b'],
            b: ['c'],
            c: ['a'],

            // Self loop around `e`
            d: ['e'],
            e: ['e'],

            // Two-way cycle loop between `f` and `g`
            f: ['g', 'a'],
            g: ['f'],

            // ^ `f` also points to `a`, but since we can't go back
            // to `f` once within the `{a, b, c}` cycle, it's treated as a
            // separate cycle.
        },
        UNUSED,
        {
            checkForCycles: 'detailed',
        },
    );
} catch (e) {
    console.log(e);
}

// Log output:
// CyclicDependencyError: At least one cycle found in provided dependencies
//     ... stack trace here {
//   cycles: [ [ 'e' ], [ 'f', 'g' ], [ 'a', 'b', 'c' ] ]
// }
```

### Logging

Using PythagoreanTriple example from earlier:

```TypeScript
const PythagoreanTripleInjector = makePythagoreanTripleInjector(
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
        log: (statement) =>
            console.log(`[PythagoreanTriple] ${statement}`),
    },
);

console.log(PythagoreanTripleInjector.digest);

// Log output:
// [PythagoreanTriple] digest - get
// [PythagoreanTriple] digest - constructing
// [PythagoreanTriple] a - get
// [PythagoreanTriple] a - constructing
// [PythagoreanTriple] a - constructed
// [PythagoreanTriple] b - get
// [PythagoreanTriple] b - constructing
// [PythagoreanTriple] b - constructed
// [PythagoreanTriple] c - get
// [PythagoreanTriple] c - constructing
// [PythagoreanTriple] a - get
// [PythagoreanTriple] a - already constructed
// [PythagoreanTriple] b - get
// [PythagoreanTriple] b - already constructed
// [PythagoreanTriple] c - constructed
// [PythagoreanTriple] digest - constructed
// 3^2 + 4^2 = 5^2
```
