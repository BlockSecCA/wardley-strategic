import type { ComponentNode, ComponentEdge, WardleyMapVisualSettings } from "./types";

/**
 * Positions components on a 2D Wardley map grid.
 * X-axis: evolution stage (genesis -> commodity)
 * Y-axis: value chain depth (longest path from root/user needs)
 */
export class WardleyPositioner {
	private settings: WardleyMapVisualSettings;

	// Canvas dimensions (matching SVG viewBox)
	private readonly CANVAS_WIDTH = 800;
	private readonly CANVAS_HEIGHT = 600;
	private readonly MARGIN = 80;
	private readonly CONTENT_WIDTH = this.CANVAS_WIDTH - (this.MARGIN * 2);
	private readonly CONTENT_HEIGHT = this.CANVAS_HEIGHT - (this.MARGIN * 2);

	// Evolution stage band centers (centered within each quarter)
	private readonly STAGE_POSITIONS: Record<string, number> = {
		genesis: 0.125,
		custom: 0.375,
		product: 0.625,
		commodity: 0.875,
	};

	constructor(settings: WardleyMapVisualSettings) {
		this.settings = settings;
	}

	position(components: ComponentNode[], edges: ComponentEdge[]): ComponentNode[] {
		const positioned = [...components];

		// Step 1: X-axis from evolution stage band centers
		this.positionByEvolution(positioned);

		// Step 2: Y-axis from dependency depth (longest path from root)
		this.positionByValueChain(positioned, edges);

		// Step 3: Evolution pairs share Y
		this.alignEvolutionPairs(positioned, edges);

		// Step 4: Spread overlapping components with connection-aware ordering
		this.spreadOverlapping(positioned, edges);

		return positioned;
	}

	private positionByEvolution(components: ComponentNode[]): void {
		for (const comp of components) {
			const stage = comp.strategic.evolution_stage || 'custom';
			const bandCenter = this.STAGE_POSITIONS[stage] ?? this.STAGE_POSITIONS.custom;
			comp.x = this.MARGIN + bandCenter * this.CONTENT_WIDTH;
		}
	}

	private positionByValueChain(components: ComponentNode[], edges: ComponentEdge[]): void {
		const depths = this.longestPathFromRoot(components, edges);
		const maxDepth = Math.max(...depths.values(), 0);

		for (const comp of components) {
			const depth = depths.get(comp.id) ?? 0;
			if (maxDepth > 0) {
				comp.y = this.MARGIN + (depth / (maxDepth + 1)) * this.CONTENT_HEIGHT;
			} else {
				comp.y = this.MARGIN + this.CONTENT_HEIGHT / 2;
			}
		}
	}

	/**
	 * Compute depth via longest path from root nodes (user needs / nodes with no incoming deps).
	 * "A depends_on B" means B is deeper. "A enables B" means A is deeper.
	 */
	longestPathFromRoot(components: ComponentNode[], edges: ComponentEdge[]): Map<string, number> {
		const depths = new Map<string, number>();
		// Forward graph: parent -> children (parent is closer to user, child is deeper)
		const children = new Map<string, string[]>();
		const hasParent = new Set<string>();

		for (const comp of components) {
			children.set(comp.id, []);
		}

		for (const edge of edges) {
			if (edge.type === 'depends_on') {
				// A depends_on B: A is parent (user-facing), B is child (infrastructure)
				children.get(edge.source)?.push(edge.target);
				hasParent.add(edge.target);
			} else if (edge.type === 'enables') {
				// A enables B: B is parent (user-facing), A is child (infrastructure)
				children.get(edge.target)?.push(edge.source);
				hasParent.add(edge.source);
			}
			// evolves_to, evolved_from, constrains don't affect depth
		}

		// Roots: user_need types first, then any node with no parent
		const roots: string[] = [];
		for (const comp of components) {
			const isUserNeed = comp.strategic.type === 'user_need';
			if (isUserNeed || !hasParent.has(comp.id)) {
				roots.push(comp.id);
				depths.set(comp.id, 0);
			}
		}

		// BFS from roots, tracking longest path
		const queue = [...roots];
		while (queue.length > 0) {
			const current = queue.shift()!;
			const currentDepth = depths.get(current) ?? 0;

			for (const child of children.get(current) ?? []) {
				const prevDepth = depths.get(child) ?? -1;
				const newDepth = currentDepth + 1;
				if (newDepth > prevDepth) {
					depths.set(child, newDepth);
					queue.push(child);
				}
			}
		}

		// Handle disconnected components: assign depth by stage
		const stageDepths: Record<string, number> = {
			genesis: 1,
			custom: 2,
			product: 3,
			commodity: 4,
		};
		const maxDepth = Math.max(...depths.values(), 0);
		for (const comp of components) {
			if (!depths.has(comp.id)) {
				const stage = comp.strategic.evolution_stage || 'custom';
				const ratio = stageDepths[stage] / 5;
				depths.set(comp.id, Math.round(ratio * (maxDepth || 4)));
			}
		}

		return depths;
	}

	/** Evolved components share Y with their source. */
	private alignEvolutionPairs(components: ComponentNode[], edges: ComponentEdge[]): void {
		for (const edge of edges) {
			if (edge.type === 'evolves_to') {
				const source = components.find(c => c.id === edge.source);
				const target = components.find(c => c.id === edge.target);
				if (source && target) {
					target.y = source.y;
				}
			} else if (edge.type === 'evolved_from') {
				const source = components.find(c => c.id === edge.source);
				const target = components.find(c => c.id === edge.target);
				if (source && target) {
					source.y = target.y;
				}
			}
		}
	}

	/**
	 * Spread components that share the same Y level and evolution stage.
	 * Order by average neighbor X to reduce edge crossings.
	 */
	private spreadOverlapping(components: ComponentNode[], edges: ComponentEdge[]): void {
		// Build neighbor lookup
		const neighbors = new Map<string, string[]>();
		for (const comp of components) {
			neighbors.set(comp.id, []);
		}
		for (const edge of edges) {
			neighbors.get(edge.source)?.push(edge.target);
			neighbors.get(edge.target)?.push(edge.source);
		}

		// Group by approximate Y and evolution stage
		const groups = new Map<string, ComponentNode[]>();
		for (const comp of components) {
			const stage = comp.strategic.evolution_stage || 'custom';
			const key = `${Math.round(comp.y)}_${stage}`;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(comp);
		}

		const compById = new Map(components.map(c => [c.id, c]));

		for (const [, group] of groups) {
			if (group.length <= 1) continue;

			const baseX = group[0].x;

			// Sort by average neighbor X to reduce crossings
			group.sort((a, b) => {
				const avgA = this.averageNeighborX(a.id, neighbors, compById);
				const avgB = this.averageNeighborX(b.id, neighbors, compById);
				return avgA - avgB;
			});

			// Adaptive spread
			const spacing = this.settings.component_spacing;
			const baseSpread = Math.min(this.CONTENT_WIDTH * 0.15, (group.length - 1) * spacing);

			group.forEach((comp, index) => {
				const offset = (index - (group.length - 1) / 2) * (baseSpread / Math.max(group.length - 1, 1));
				comp.x = Math.max(this.MARGIN, Math.min(this.CANVAS_WIDTH - this.MARGIN, baseX + offset));
			});
		}
	}

	private averageNeighborX(
		id: string,
		neighbors: Map<string, string[]>,
		compById: Map<string, ComponentNode>
	): number {
		const neighIds = neighbors.get(id) ?? [];
		let sum = 0;
		let count = 0;
		for (const nid of neighIds) {
			const nc = compById.get(nid);
			if (nc) {
				sum += nc.x;
				count++;
			}
		}
		return count > 0 ? sum / count : compById.get(id)?.x ?? 400;
	}
}
