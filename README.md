# chaq-di-ts

Relatively lightweight dependency injection tool

![Demo showing functionality and auto-complete](demo.gif)

## Requirements

- TypeScript ^5.9.3
- ES2020 or later

## Usage

### Terminology

- Interface - Collection of objects, denoted by a unique name and a type, that have some dependency on each other
  in order to be constructed
- Members - Individual object in a interface, has a unique name and a type
- Dependencies - For a given member, a list of other members which need to be constructed first, as this member
  requires them during its creation
- Module - Instructions describing how to construct each member given its dependencies
- Injector - Finished implementation of interface which constructs members based on the provided module

### Basic usage

```TypeScript
// Specify an interface
interface RightTriangle {
    a: number;
    b: number;
    c: number;

    digest: string;
}

// Create injector "factory"
const makeRightTriangleInjector = makeInjectorFactory<RightTriangle>();

// ^ This pattern is due to TypeScript requiring either all or no types to be passed into a template, there
// is no partial deduction.
// So you call `makeInjectorFactory<T>` and get back the function to create the injector
// This returned function accepts generic arguments based on `T`, which allows auto-complete to work
// for the dependencies, and subsequently it allows auto-complete to work for the module,
// based on the dependencies.

// Create an injector by specifying dependencies, and then the module based on dependencies
const RightTriangleInjector = makeRightTriangleInjector(
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

// Get member from newly created injector, all of its dependencies will be lazily constructed
console.log(RightTriangleInjector.digest);

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
}

try {
    const ABCsInjector = makeInjectorFactory<ABCs>()(
        {
            // Three-way cycle loop between `a`, `b`, and `c`
            a: ['b'],
            b: ['c'],
            c: ['a'],

            // Two-way cycle loop between `e` and `d`
            d: ['e', 'a'],
            e: ['d'],

            // ^ `e` also points to `a`, but since we can't go back
            // to `e` once within the `{a, b, c}` cycle, it's treated as a
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
//   cycles: [ [ 'd', 'e' ], [ 'a', 'b', 'c' ] ]
// }
```

### Logging

Using RightTriangle example from earlier:

```TypeScript
const RightTriangleInjector = makeRightTriangleInjector(
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
    {
        log: (statement) =>
            console.log(`[RightTriangle] ${statement}`),
    },
);

console.log(RightTriangleInjector.digest);

// Log output:
// [RightTriangle] digest - get
// [RightTriangle] digest - constructing
// [RightTriangle] a - get
// [RightTriangle] a - constructing
// [RightTriangle] a - constructed
// [RightTriangle] b - get
// [RightTriangle] b - constructing
// [RightTriangle] b - constructed
// [RightTriangle] c - get
// [RightTriangle] c - constructing
// [RightTriangle] a - get
// [RightTriangle] a - already constructed
// [RightTriangle] b - get
// [RightTriangle] b - already constructed
// [RightTriangle] c - constructed
// [RightTriangle] digest - constructed
// 3^2 + 4^2 = 5^2
```

### Using types ahead of making the injector

You can use `DependenciesListRecord<I>` and `MemberProviderModule<I, D>` to model the dependencies and module without
needing to call `makeInjectorFactory<I>`. However, for the dependencies to provide the right auto-complete in the
module, it's necessary to let the dependencies object type be as precise as possible, so you should use the `satisfies`
keyword to enforce autocomplete, and verify the type fits.

```TypeScript
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

const FooBarInjector = makeInjectorFactory<FooBar>()(fooBarDependencies, fooBraModule);

console.log(FooBaerInjector.combined);

// Log output:
// foobar
```

## Changelogs

### 1.1.0

- Improved typing to disallow self-cycles in the type system instead of needing to check at runtime
