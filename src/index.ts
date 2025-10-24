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

const completeCycleCheck = <I>(dependencies: DependenciesListRecord<I>) => {
    enum VisitState {
        VISITING,
        VISITED,
    }

    type Node = keyof I;

    type VisitingInfo = {
        state: VisitState.VISITING;
        visitIdx: number;
        minCycleNeighborIdx: number;
    };

    type VisitedInfo = {
        state: VisitState.VISITED;
        minCycleNeighborIdx: number;
        cycleParent: Node;
    };

    type NodeInfo = VisitingInfo | VisitedInfo;

    const nodeInfoMap: Map<Node, NodeInfo> = new Map();
    const visitOrderedList: Node[] = [];
    const setSelfCycle: Set<Node> = new Set();

    let cycles = false;

    // Pre-condition: key is not yet visited
    const dfsVisit = (key: Node) => {
        console.info(`visit ${String(key)}`);
        const neighbors = dependencies[key];

        // Add to visit list (for key lookup + visit order index)
        const visitIdx = visitOrderedList.length;
        visitOrderedList.push(key);

        // Construct node info as object so we have a reference to it to update
        let nodeInfo: NodeInfo = {
            state: VisitState.VISITING,
            visitIdx,
            minCycleNeighborIdx: visitIdx,
        };

        // Set visit info as our info
        nodeInfoMap.set(key, nodeInfo);

        for (const neighbor of neighbors) {
            console.info(`key ${String(key)} neighbor ${String(neighbor)}`);

            if (neighbor === key) {
                setSelfCycle.add(key);
                cycles = true;
                continue;
            }

            let neighborInfo = nodeInfoMap.get(neighbor);
            if (neighborInfo === undefined) {
                // Unvisited, visit...
                dfsVisit(neighbor);
                const neighborInfo = nodeInfoMap.get(neighbor)!;
                console.info(
                    `key ${String(key)} (${nodeInfo.minCycleNeighborIdx}) after visiting neighbor ${String(neighbor)} (${
                        neighborInfo.minCycleNeighborIdx
                    })`,
                );
                nodeInfo.minCycleNeighborIdx = Math.min(nodeInfo.minCycleNeighborIdx, neighborInfo.minCycleNeighborIdx);
                console.info(nodeInfoMap);
            } else if (neighborInfo.state === VisitState.VISITING) {
                cycles = true;
                console.info(
                    `key ${String(key)} (${nodeInfo.minCycleNeighborIdx}) visiting neighbor ${String(neighbor)} (${
                        neighborInfo.minCycleNeighborIdx
                    })`,
                );
                // Visiting, we want to record some stuff here
                nodeInfo.minCycleNeighborIdx = Math.min(nodeInfo.minCycleNeighborIdx, neighborInfo.minCycleNeighborIdx);
            }
        }

        console.info('post edge visit node info', key, nodeInfo);

        nodeInfo = {
            state: VisitState.VISITED,
            minCycleNeighborIdx: nodeInfo.minCycleNeighborIdx,
            cycleParent: visitOrderedList[nodeInfo.minCycleNeighborIdx]!,
        };
        nodeInfoMap.set(key, nodeInfo);

        console.info('node info', key, nodeInfo);
        console.info(`exit visit ${String(key)}`);
    };

    for (const node in dependencies) {
        console.info(`chaq ${node}`);
        const nodeInfo = nodeInfoMap.get(node);
        if (nodeInfo === undefined) {
            dfsVisit(node);
        }
    }

    console.info('final', nodeInfoMap);

    if (!cycles) return;

    // TODO: routine:
    // - resolve parents (have to dive until for a node it is its own parent)
    // - print self cycles
    // - collect cycles by parent
    // - print in ascending order by size
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
            // if (anyCycilcDependencies(dependencies)) {
            //     throw new Error('Dependency graph has cycle');
            // }
            completeCycleCheck(dependencies);
            throw new Error('Dependency graph has cycle');
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
