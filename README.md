# chaq-di-ts

Relatively lightweight dependency injection tool

```TypeScript
 interface PythagoreanTriple {
    a: number;
    b: number;
    c: number;

    digest: string;
}

const makePythagoreanTripleInjector = makeInjectorFactory<PythagoreanTriple>();

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

## Requirements
- TypeScript ^5.9.3
- ES2019 or later