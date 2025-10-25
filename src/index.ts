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
type DependenciesList<I> = readonly (keyof I)[];

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
 * Type which maps names of members in the interface, to a function returning the constructed memeber, given an
 * arguments object containing the member's dependencies
 */
export type MemberProviderModule<I, D extends DependenciesListRecord<I>> = {
    [K in keyof I]: (args: RecordDepsFromDepsList<I, D[K]>) => I[K];
};

export class CyclicDependencyError extends Error {
    static STANDARD_MESSAGE: string = 'At least one cycle found in provided dependencies';

    public readonly cycles: string[][] | undefined;

    constructor(message: string, cycles?: string[][]) {
        super(message);
        this.name = 'CyclicDependencyError';

        this.cycles = cycles
            ?.map((list) => Array.from(list).sort())
            .sort((a, b) => {
                const lenCmp = a.length - b.length;

                // Sort by length first
                if (lenCmp !== 0) return lenCmp;

                // Then sort "lexicographically"
                return a.join().localeCompare(b.join());
            });

        Object.setPrototypeOf(this, CyclicDependencyError.prototype);
    }

    public toString(): string {
        if (this.cycles) {
            return `${this.name}: ${this.message}\nCycles: [\n${this.cycles
                .map((cycle) => `    [${cycle.join(', ')}]`)
                .join('\n')}\n]`;
        }
        return `${this.name}: ${this.message}`;
    }
}

const getCycles = <I>(dependencies: DependenciesListRecord<I>): (keyof I & string)[][] => {
    enum VisitState {
        VISITING,
        VISITED,
    }
    type Node = keyof I & string;
    type VisitingInfo = {
        state: VisitState.VISITING;
        visitIdx: number;
        minVisitIdx: number;
    };
    type VisitedInfo = {
        state: VisitState.VISITED;
        minVisitIdx: number;
        cycleParent: Node;
    };
    type NodeInfo = VisitingInfo | VisitedInfo;

    const mapNodeInfo: Map<Node, NodeInfo> = new Map();
    const visitOrderedList: Node[] = [];
    const setSelfCycle: Set<Node> = new Set();

    let cycles = false;

    // Pre-condition: key is not yet visited
    const dfsVisit = (key: Node) => {
        const neighbors = dependencies[key];

        // Add to visit list (for key lookup + visit order index)
        const visitIdx = visitOrderedList.length;
        visitOrderedList.push(key);

        // Construct node info as object so we have a reference to it to update
        let nodeInfo: NodeInfo = {
            state: VisitState.VISITING,
            visitIdx,
            minVisitIdx: visitIdx,
        };

        // Set visit info as our info
        mapNodeInfo.set(key, nodeInfo);

        for (const neighbor of neighbors) {
            if (typeof neighbor !== 'string') {
                continue;
            }

            if (neighbor === key) {
                setSelfCycle.add(key);
                cycles = true;
                continue;
            }

            let neighborInfo = mapNodeInfo.get(neighbor);
            if (neighborInfo === undefined) {
                // Unvisited, visit this neigbor
                neighborInfo = dfsVisit(neighbor);
            } else if (neighborInfo.state === VisitState.VISITING) {
                // Neighbor is in the middle of being visited, means there is a cycle
                cycles = true;
            }
            nodeInfo.minVisitIdx = Math.min(nodeInfo.minVisitIdx, neighborInfo.minVisitIdx);
        }

        nodeInfo = {
            state: VisitState.VISITED,
            minVisitIdx: nodeInfo.minVisitIdx,
            cycleParent: visitOrderedList[nodeInfo.minVisitIdx]!,
        };
        mapNodeInfo.set(key, nodeInfo);

        return nodeInfo;
    };

    for (const node in dependencies) {
        const nodeInfo = mapNodeInfo.get(node);
        if (nodeInfo === undefined) {
            dfsVisit(node);
        }
    }

    if (!cycles) return [];

    // Map from a given node to its component root
    const mapComponentRoot: Map<Node, Node> = new Map();

    // Map of root node to its components, collection of all the cycles keyed by their root
    const mapComponents: Map<Node, Node[]> = new Map();

    const getComponentRoot = (node: Node, nodeInfo: VisitedInfo): Node => {
        if (nodeInfo.cycleParent === node) {
            return node;
        }

        const cachedRoot = mapComponentRoot.get(node);

        if (cachedRoot !== undefined) return cachedRoot;

        const nextNodeInfo = mapNodeInfo.get(nodeInfo.cycleParent)!;

        if (nextNodeInfo.state !== VisitState.VISITED) throw new Error("Unexpected node state, there's a bug");

        return getComponentRoot(nodeInfo.cycleParent, nextNodeInfo);
    };

    for (const [node, nodeInfo] of mapNodeInfo.entries()) {
        if (nodeInfo.state !== VisitState.VISITED) throw new Error("Unexpected node state, there's a bug");

        const componentRoot = getComponentRoot(node, nodeInfo);
        mapComponentRoot.set(node, componentRoot);

        const components = mapComponents.get(componentRoot);
        if (components === undefined) {
            mapComponents.set(componentRoot, [node]);
        } else {
            components.push(node);
        }
    }

    // Filtering out components with length == 1, they are either not part of a cycle, or a self-cycle, which we
    // are covering below
    const listNonSelfCycles: Node[][] = Array.from(mapComponents.values()).filter((list) => list.length > 1);

    const listSelfCycles = Array.from(setSelfCycle.keys())
        .filter((node) => {
            // Self-cycle, node is not root of its component (component length must be > 1)
            const parent = mapComponentRoot.get(node);
            if (parent !== node) return false;

            // Self-cycle, node is parent of root, look up component to check if length > 1
            const component = mapComponents.get(node);
            if (component !== undefined && component.length > 1) return false;

            return true;
        })
        .map((node) => [node]);

    const listCycles = listSelfCycles.concat(listNonSelfCycles);

    return listCycles;
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

                if (neighborVisitState === VisitState.VISITNG) {
                    return true;
                } else if (neighborVisitState === undefined && dfsVisit(neighbor)) {
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
     *
     * Provide `'simple'` to immediately throw if at least one cycle is found, and you don't want to gather the list of
     * cycles. Provide `'detailed'` to gather the list of all cycles found in the graph, organized into
     * strongly-connected components. Provide `undefined` to skip cycle check entirely, at the risk of potentially going
     * into an infinite loop at runtime if a cycle is present in the dependency graph.
     *
     * @default 'simple'
     */
    checkForCycles?: 'skip' | 'simple' | 'detailed';

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
        const checkCyclesOption = options?.checkForCycles ?? 'simple';
        if (checkCyclesOption === 'simple') {
            if (anyCycilcDependencies(dependencies)) {
                throw new CyclicDependencyError(CyclicDependencyError.STANDARD_MESSAGE);
            }
        } else if (checkCyclesOption === 'detailed') {
            const cycles = getCycles(dependencies);
            if (cycles.length > 0) {
                throw new CyclicDependencyError(CyclicDependencyError.STANDARD_MESSAGE, cycles);
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
                    Array.from(memberDepsNames.values()).map(
                        (depName) => [depName, (finishedInjector as I)[depName]] as const,
                    ),
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
