/**
 * DI Terminology
 * - Interface - Collection of members that have some dependency on each other in order to be constructed
 * - Members - Individual object in a interface, has a name and a type
 * - Dependencies - For a given member, a list of other members which need to be constructed first, as this member
 *     requires them during its creation
 * - Module - Instructions describing how to construct each member given its dependencies
 * - Injector - Finished implementation of interface which constructs members based on the provided module
 */

/**
 * Dependencies list: An array of the names of the members in the interface, which a given member depends on.
 */
type DependenciesList<T> = readonly (keyof T)[];

/**
 * In dependencies record, provide, for each member of the interface, an array of the names of the other members
 * in the interface which the current member depends on.
 */
export type DependenciesListRecord<I> = Record<keyof I, DependenciesList<I>>;

/**
 * Maps the list/tuple of member names in a dependencies list to a record mapping the member name to the corresponding
 * type in the interface
 */
type RecordDepsFromDepsList<I, L extends DependenciesList<I>> = {
    [Key in L[number]]: I[Key];
};

/**
 * Type which maps names of members in the interface, to a function returning the constructed memebr, given an arguments
 * object containing the member's dependencies
 */
export type MemberProviderModule<I, D extends DependenciesListRecord<I>> = {
    [K in keyof I]: (args: RecordDepsFromDepsList<I, D[K]>) => I[K];
};

/**
 * Check dependencies for any cycles
 * @template I - interface
 * @param dependencies - Dependency graph for interface `I`
 * @returns `true` if dependencies has any cycles. `false` otherwise
 */
const anyCycilcDependencies = <I>(dependencies: DependenciesListRecord<I>): boolean => {
    enum VisitState {
        VISITNG,
        VISITED,
    }

    const visitaitonMap: Map<keyof I, VisitState> = new Map();

    const dfsVisit = (key: keyof I): boolean => {
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

export interface DependencyInjectionOptions {
    /**
     * Check dependencies for cycles on creation of injector. Can be disabled in case of performance concerns.
     * @default true
     */
    checkForCycles?: boolean;

    /**
     * Logging callback for listening in on injector usage.
     * @param statement Log statement from injector.
     */
    log?: (statement: string) => void;
}

/**
 * Create factory for an injector for a given interface I.
 *
 * NOTE: Using function "currying" because TypeScript makes you provide either no type arguments or all of them.
 * Unfortunately, using type defaults gets in the way of being able to have autocomplete on a type, while also keeping
 * the very specific type (we need to know the *exact* type of `dependencies` in order to determine the type for
 * `module`)
 *
 * @template I - Interface type
 * @returns Injector factory for `I`
 */
export function makeInjectorFactory<I extends Record<string, any>>() {
    return <const D extends DependenciesListRecord<I>>(
        dependencies: D,
        module: MemberProviderModule<I, D>,
        options?: DependencyInjectionOptions,
    ): I => {
        // First check for any cycles
        if (options?.checkForCycles ?? true) {
            if (anyCycilcDependencies<I>(dependencies)) {
                throw new Error('Dependency graph has cycle');
            }
        }

        // Initialize map of member name to created member objects
        const mapModuleObjects: Map<keyof D, I[keyof I]> = new Map();

        // Create functions for each member based on dependencies and providers
        const finishedInjector: any = {};
        for (const member in dependencies) {
            const memberDepsNames = dependencies[member];

            const get = () => {
                if (options?.log) {
                    options.log(`${member} - get`);
                }

                // Check map for if member was already made
                const tryGet = mapModuleObjects.get(member);

                if (tryGet != undefined) {
                    if (options?.log) {
                        options.log(`${member} - already constructed`);
                    }
                    return tryGet;
                }

                if (options?.log) {
                    options.log(`${member} - constructing`);
                }

                // Get all dependencies from the finished injector
                // By the time we're actually reaching this code, getters for each member are populated,
                // and (ideally) there are no cycles, so these members will be constructed first and exit.
                const memberDeps = Object.fromEntries(
                    memberDepsNames.values().map((depName) => [depName, (finishedInjector as I)[depName]] as const),
                ) as RecordDepsFromDepsList<I, D[keyof I]>;

                // Pass into provider to make member
                const memberProvider = module[member as keyof MemberProviderModule<I, D>];
                const memberObject = memberProvider(memberDeps);

                // Set in map for later retrieval
                mapModuleObjects.set(member, memberObject);

                if (options?.log) {
                    options.log(`${member} - constructed`);
                }

                return memberObject;
            };

            Object.defineProperty(finishedInjector, member, {
                enumerable: true,
                get,
            });
        }

        return finishedInjector as I;
    };
}

// TODO: update doc comments
