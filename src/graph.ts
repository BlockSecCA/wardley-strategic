import type { StrategicNode, StrategicEdge, EdgeType } from "./types";

/**
 * Simple adjacency-list graph for strategic components.
 * Replaces graphology's MultiGraph with ~80 lines of code.
 */
export class StrategicGraph {
	private nodes: Map<string, StrategicNode> = new Map();
	private edges: StrategicEdge[] = [];
	private outIndex: Map<string, StrategicEdge[]> = new Map();
	private inIndex: Map<string, StrategicEdge[]> = new Map();

	addNode(id: string, node: StrategicNode): void {
		this.nodes.set(id, node);
		if (!this.outIndex.has(id)) this.outIndex.set(id, []);
		if (!this.inIndex.has(id)) this.inIndex.set(id, []);
	}

	getNode(id: string): StrategicNode | undefined {
		return this.nodes.get(id);
	}

	hasNode(id: string): boolean {
		return this.nodes.has(id);
	}

	forEachNode(callback: (id: string, node: StrategicNode) => void): void {
		for (const [id, node] of this.nodes) {
			callback(id, node);
		}
	}

	nodeCount(): number {
		return this.nodes.size;
	}

	addEdge(source: string, target: string, field: EdgeType): void {
		const edge: StrategicEdge = { source, target, field };
		this.edges.push(edge);

		if (!this.outIndex.has(source)) this.outIndex.set(source, []);
		this.outIndex.get(source)!.push(edge);

		if (!this.inIndex.has(target)) this.inIndex.set(target, []);
		this.inIndex.get(target)!.push(edge);
	}

	forEachEdge(callback: (edge: StrategicEdge) => void): void {
		for (const edge of this.edges) {
			callback(edge);
		}
	}

	getOutEdges(nodeId: string): StrategicEdge[] {
		return this.outIndex.get(nodeId) ?? [];
	}

	getInEdges(nodeId: string): StrategicEdge[] {
		return this.inIndex.get(nodeId) ?? [];
	}

	edgeCount(): number {
		return this.edges.length;
	}

	/** Returns all nodes that have strategic metadata. */
	getStrategicNodes(): StrategicNode[] {
		const result: StrategicNode[] = [];
		for (const node of this.nodes.values()) {
			if (node.strategic) result.push(node);
		}
		return result;
	}

	clear(): void {
		this.nodes.clear();
		this.edges = [];
		this.outIndex.clear();
		this.inIndex.clear();
	}
}
