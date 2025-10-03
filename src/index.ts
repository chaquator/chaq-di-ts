/**
 * Dependencies list: An array of the names of the members in the interface, which a given member depends on.
 */
type DepsList<T> = readonly (keyof T)[];

/**
 * In dependencies record, provide, for each member of the interface, an array of the names of the other members
 * in the interface which the current member depends on.
 */
type DepsRecords<T> = Record<keyof T, DepsList<T>>;

/**
 * Maps the list/tuple of member names in a dependencies list to a record mapping the member name to the corresponding
 * type in the interface
 */
type RecordDepsFromDepsList<T, L extends DepsList<T>> = {
    [Key in L[number]]: T[Key];
};

/**
 * Interface which maps names of members in the interface, to a function, accepting an arguments object
 * containing the member's dependencies as fields, which provides the member.
 */
type MemberProviderInterface<T, D extends DepsRecords<T>> = {
    [K in keyof T]: T[K] extends undefined | null | void ? never : (args: RecordDepsFromDepsList<T, D[K]>) => T[K];
};

/**
 * Dependency injection options;
 * - checkForCycles - Check dependency graph for cycles. Turn off to spare performance once validated
 */
export interface DIOptions {
    checkForCycles?: boolean;
    log?: (statement: string) => void;
}

/**
 * Function which creates a dependency injection factory given a DI module interface type. In the interface,
 * `null`, `undefined`, and `void` are disallowed.
 *
 * @returns DI module factory for the given interface
 */
export function makeDIModuleFactory<T>() {
    /**
     * Check dependencies for any cycles
     * @param dependencies - Dependency graph for desired DI module
     * @returns `true` if dependencies has any cycles
     */
    const anyCycilcDependencies = <D extends DepsRecords<T>>(dependencies: D): boolean => {
        enum VisitState {
            VISITNG,
            VISITED,
        }

        const visitaitonMap: Map<keyof D, VisitState> = new Map();

        const dfsVisit = (key: keyof D): boolean => {
            const neighbors = dependencies[key];

            if (neighbors.length > 0) {
                visitaitonMap.set(key, VisitState.VISITNG);
                for (const neighbor of neighbors) {
                    if (neighbor == key) {
                        return true;
                    }

                    const neighborVisitState = visitaitonMap.get(neighbor);

                    if (neighborVisitState !== undefined && neighborVisitState === VisitState.VISITNG) {
                        return true;
                    } else if (dfsVisit(neighbor)) {
                        return true;
                    }
                }
            }

            visitaitonMap.set(key, VisitState.VISITED);
            return false;
        };

        for (const key in dependencies) {
            const visitState = visitaitonMap.get(key);
            if (visitState === undefined && dfsVisit(key)) {
                return true;
            }
        }

        return false;
    };

    /**
     * Dependency injection module factory which, when provided a dependency graph and providers, constructs
     * a module that will create all of its members according to their dependencies and providers
     *
     * @param dependencies - Record which maps member names from the module interface to a list of other member names
     * which the given member depends on to be created.
     *
     * @param memberProviders - Record that maps member names from the module interface to a function, which accepts
     * its dependencies (specified in `dependencies` parameter) within the fields of a singular arguments object parameter,
     * and returns the appropriate type corresponding to the module interface.
     *
     * If `dependencies` is passed in correctly, autocomplete when destructuring the arguments object should
     * show the correct dependency members and their types. See the example and unit tests.
     *
     * @param options - DI options
     *
     * @returns DI module which matches input interface and each property is a lazy getter, which constructs its
     * member value given its dependencies
     *
     * @example
     * ```
     * interface TriangleInfo {
     *     a: number;
     *     b: number;
     *     c: number;
     *     specs: string;
     * }
     *
     * const makeTriangleInfo = makeDIModuleFactory<TriangleInfo>();
     *
     * const triangleInfoModule = makeTriangleInfo(
     *     {
     *         a: [],
     *         b: [],
     *         c: ['a', 'b'],
     *         specs: ['a', 'b', 'c'],
     *     },
     *     {
     *         a() {
     *             return 3;
     *         },
     *         b() {
     *             return 4;
     *         },
     *         c({ a, b }) {
     *             return Math.pow(Math.pow(a, 2) + Math.pow(b, 2), 0.5);
     *         },
     *         specs({ a, b, c }) {
     *             return `${a}^2 + ${b}^2 = ${c}^2`;
     *         },
     *     },
     * );
     *
     * test('triangle', () => expect(triInfoMdoule.specs).toBe('3^2 + 4^2 = 5^2'));
     *
     * ```
     */
    const diFactory = <const D extends DepsRecords<T>>(
        dependencies: D,
        memberProviders: MemberProviderInterface<T, D>,
        options?: DIOptions,
    ): T => {
        // First check for any cycles
        if (options?.checkForCycles) {
            if (anyCycilcDependencies(dependencies)) {
                throw new Error('Dependency graph has cycle');
            }
        }

        // Initialize map of member name to created member objects
        const mapModuleObjects: Map<keyof D, T[keyof T]> = new Map();

        // Create functions for each member based on dependencies and providers
        const finishedModule: any = {};
        for (const member in dependencies) {
            const memberDepsNames = dependencies[member];

            const get = () => {
                if (options?.log) {
                    options.log(`Get ${member}`);
                }

                // Check map for if member was already made
                const tryGet = mapModuleObjects.get(member);

                if (tryGet != undefined) {
                    if (options?.log) {
                        options.log(`Found member ${member} in map`);
                    }
                    return tryGet;
                }

                if (options?.log) {
                    options.log(`Member ${member} not found in map. Constructing...`);
                }

                // Get all dependencies from finishedModule
                const memberDeps: any = Object.fromEntries(
                    memberDepsNames.values().map((depName) => [depName, finishedModule[depName]] as const),
                );

                // Pass into provider to make member
                const memberProvider = memberProviders[member as unknown as keyof MemberProviderInterface<T, D>];
                const memberObject = memberProvider(memberDeps);

                // Set in map for later retrieval
                mapModuleObjects.set(member, memberObject);

                if (options?.log) {
                    options.log(`Member ${member} constructed and saved to map`);
                }

                return memberObject;
            };

            Object.defineProperty(finishedModule, member, {
                enumerable: true,
                get,
            });
        }

        return finishedModule as T;
    };

    return diFactory;
}
