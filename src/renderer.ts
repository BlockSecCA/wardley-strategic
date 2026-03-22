import type { StrategicGraph } from "./graph";
import type { MapContextManager } from "./map-context";
import type { ComponentNode, ComponentEdge, WardleyMapVisualSettings, EdgeType } from "./types";
import { WardleyPositioner } from "./positioner";

/**
 * Renders the Wardley map as SVG inside a container element.
 */
export class WardleyMapRenderer {
	private container: HTMLElement;
	private graph: StrategicGraph;
	private contextManager: MapContextManager;
	private settings: WardleyMapVisualSettings;
	private onComponentClick: (path: string) => void;

	private positioner: WardleyPositioner;
	private svg: SVGElement | null = null;
	private components: ComponentNode[] = [];
	private edges: ComponentEdge[] = [];

	constructor(
		container: HTMLElement,
		graph: StrategicGraph,
		contextManager: MapContextManager,
		settings: WardleyMapVisualSettings,
		onComponentClick: (path: string) => void,
	) {
		this.container = container;
		this.graph = graph;
		this.contextManager = contextManager;
		this.settings = settings;
		this.onComponentClick = onComponentClick;
		this.positioner = new WardleyPositioner(settings);
	}

	render(mapId: string): void {
		this.clearCanvas();
		this.loadComponents(mapId);
		this.loadEdges();
		this.positionComponents();
		this.createSVG();
		this.renderAxes();
		this.renderEdges();
		this.renderComponents();
	}

	private clearCanvas(): void {
		this.container.empty();
		this.svg = null;
		this.components = [];
		this.edges = [];
	}

	private loadComponents(mapId: string): void {
		const componentIds = this.contextManager.getComponentsForMap(mapId);

		this.components = [];
		for (const id of componentIds) {
			const node = this.graph.getNode(id);
			if (!node?.strategic) continue;

			this.components.push({
				id,
				name: this.getDisplayName(id),
				strategic: node.strategic,
				x: 0,
				y: 0,
			});
		}
	}

	private loadEdges(): void {
		this.edges = [];
		const componentIds = new Set(this.components.map(c => c.id));

		this.graph.forEachEdge((edge) => {
			if (componentIds.has(edge.source) && componentIds.has(edge.target)) {
				this.edges.push({
					source: edge.source,
					target: edge.target,
					type: edge.field,
				});
			}
		});
	}

	private positionComponents(): void {
		this.components = this.positioner.position(this.components, this.edges);
	}

	private createSVG(): void {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '100%');
		svg.setAttribute('height', '100%');
		svg.setAttribute('viewBox', '0 0 800 600');
		svg.style.width = '100%';
		svg.style.height = '100%';

		// Arrow marker for evolution edges
		const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

		const evolutionMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
		evolutionMarker.setAttribute('id', 'evolution-arrow');
		evolutionMarker.setAttribute('markerWidth', '10');
		evolutionMarker.setAttribute('markerHeight', '10');
		evolutionMarker.setAttribute('refX', '8');
		evolutionMarker.setAttribute('refY', '3');
		evolutionMarker.setAttribute('orient', 'auto');
		evolutionMarker.setAttribute('markerUnits', 'strokeWidth');

		const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		arrowPath.setAttribute('d', 'M0,0 L0,6 L9,3 z');
		arrowPath.setAttribute('fill', 'var(--color-purple)');
		evolutionMarker.appendChild(arrowPath);

		defs.appendChild(evolutionMarker);
		svg.appendChild(defs);

		this.container.appendChild(svg);
		this.svg = svg;
	}

	private renderAxes(): void {
		if (!this.svg) return;

		const axesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		axesGroup.setAttribute('class', 'wardley-axes');

		// Y-axis
		const yAxis = this.createLine(80, 50, 80, 550, 'var(--text-muted)', 2);
		axesGroup.appendChild(yAxis);

		// X-axis
		const xAxis = this.createLine(80, 550, 750, 550, 'var(--text-muted)', 2);
		axesGroup.appendChild(xAxis);

		// Axis labels
		if (this.settings.show_axis_labels) {
			const yLabel = this.createText(50, 300, 'Value Chain', 'var(--text-muted)', 14);
			yLabel.setAttribute('transform', 'rotate(-90, 50, 300)');
			axesGroup.appendChild(yLabel);

			const xLabel = this.createText(415, 590, 'Evolution', 'var(--text-muted)', 14);
			axesGroup.appendChild(xLabel);
		}

		// Evolution stage markers
		const stages = ['Genesis', 'Custom', 'Product', 'Commodity'];
		const stageCenters = [0.125, 0.375, 0.625, 0.875];

		for (let i = 0; i < stages.length; i++) {
			const x = 80 + (stageCenters[i] * 640);

			if (this.settings.show_evolution_grid) {
				const gridLine = this.createLine(x, 50, x, 550,
					this.settings.grid_color, 1, '2,3');
				gridLine.setAttribute('opacity', this.settings.grid_opacity.toString());
				axesGroup.appendChild(gridLine);
			}

			const tick = this.createLine(x, 545, x, 555, 'var(--text-muted)', 1);
			axesGroup.appendChild(tick);

			const label = this.createText(x, 575, stages[i], 'var(--text-muted)', 12);
			axesGroup.appendChild(label);
		}

		this.svg.appendChild(axesGroup);
	}

	private renderEdges(): void {
		if (!this.svg) return;

		const edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		edgesGroup.setAttribute('class', 'wardley-edges');

		for (const edge of this.edges) {
			const source = this.components.find(c => c.id === edge.source);
			const target = this.components.find(c => c.id === edge.target);
			if (!source || !target) continue;

			const radius = this.settings.node_size;
			const { x1, y1, x2, y2 } = this.clipLineToCircles(
				source.x, source.y, target.x, target.y, radius
			);

			const line = this.createLine(x1, y1, x2, y2,
				this.getEdgeColor(edge.type), this.settings.edge_thickness,
				this.getEdgeDash(edge.type));

			if (edge.type === 'evolves_to') {
				line.setAttribute('marker-end', 'url(#evolution-arrow)');
			}

			edgesGroup.appendChild(line);
		}

		this.svg.appendChild(edgesGroup);
	}

	private renderComponents(): void {
		if (!this.svg) return;

		const componentsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		componentsGroup.setAttribute('class', 'wardley-components');

		for (const comp of this.components) {
			// Circle
			const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			circle.setAttribute('cx', comp.x.toString());
			circle.setAttribute('cy', comp.y.toString());
			circle.setAttribute('r', this.settings.node_size.toString());
			circle.setAttribute('fill', this.getComponentColor(comp));
			circle.setAttribute('stroke', 'var(--text-normal)');
			circle.setAttribute('stroke-width', '2');
			circle.setAttribute('class', 'wardley-component');
			circle.addEventListener('click', () => this.onComponentClick(comp.id));

			// Tooltip
			const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
			title.textContent = [
				comp.name,
				`Type: ${comp.strategic.type || 'unknown'}`,
				`Evolution: ${comp.strategic.evolution_stage || 'unknown'}`,
				`Importance: ${comp.strategic.strategic_importance || 'unknown'}`,
			].join('\n');
			circle.appendChild(title);

			componentsGroup.appendChild(circle);

			// Label
			const text = this.createText(
				comp.x,
				comp.y + this.settings.node_size + 13,
				comp.name,
				'var(--text-normal)',
				this.settings.font_size,
			);
			text.setAttribute('class', 'wardley-label');
			componentsGroup.appendChild(text);
		}

		this.svg.appendChild(componentsGroup);
	}

	// --- Helpers ---

	private getDisplayName(path: string): string {
		return path.split('/').pop()?.replace('.md', '') || path;
	}

	private getComponentColor(comp: ComponentNode): string {
		const importance = comp.strategic.strategic_importance || 'supporting';
		return this.settings.node_colors[importance] || this.settings.node_colors.supporting;
	}

	private getEdgeColor(type: EdgeType): string {
		const colorMap: Record<string, string> = {
			depends_on: 'var(--color-blue)',
			enables: 'var(--color-green)',
			constrains: 'var(--color-red)',
			evolves_to: 'var(--color-purple)',
			evolved_from: 'var(--color-purple)',
		};
		return colorMap[type] || 'var(--text-muted)';
	}

	private getEdgeDash(type: EdgeType): string {
		if (type === 'constrains') return '5,5';
		if (type === 'evolves_to' || type === 'evolved_from') return '3,3';
		return '';
	}

	private clipLineToCircles(
		sx: number, sy: number, tx: number, ty: number, radius: number
	): { x1: number; y1: number; x2: number; y2: number } {
		const dx = tx - sx;
		const dy = ty - sy;
		const dist = Math.sqrt(dx * dx + dy * dy);

		if (dist <= radius * 2) return { x1: sx, y1: sy, x2: tx, y2: ty };

		const ux = dx / dist;
		const uy = dy / dist;

		return {
			x1: sx + ux * radius,
			y1: sy + uy * radius,
			x2: tx - ux * radius,
			y2: ty - uy * radius,
		};
	}

	private createLine(
		x1: number, y1: number, x2: number, y2: number,
		stroke: string, strokeWidth: number, dashArray?: string
	): SVGLineElement {
		const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
		line.setAttribute('x1', x1.toString());
		line.setAttribute('y1', y1.toString());
		line.setAttribute('x2', x2.toString());
		line.setAttribute('y2', y2.toString());
		line.setAttribute('stroke', stroke);
		line.setAttribute('stroke-width', strokeWidth.toString());
		if (dashArray) line.setAttribute('stroke-dasharray', dashArray);
		return line;
	}

	private createText(
		x: number, y: number, content: string, fill: string, fontSize: number
	): SVGTextElement {
		const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		text.setAttribute('x', x.toString());
		text.setAttribute('y', y.toString());
		text.setAttribute('text-anchor', 'middle');
		text.setAttribute('fill', fill);
		text.setAttribute('font-size', fontSize.toString());
		text.textContent = content;
		return text;
	}
}
