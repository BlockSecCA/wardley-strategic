import type { App } from "obsidian";
import { Notice } from "obsidian";
import type { StrategicGraph } from "./graph";
import type { MapContextManager } from "./map-context";
import type { ComponentNode, ComponentEdge, WardleyMapVisualSettings } from "./types";
import { WardleyPositioner } from "./positioner";

/**
 * Export the current map as Online Wardley Maps (OWM) text format.
 * OWM uses [visibility, evolution] where:
 *   visibility: 0 (bottom) to 1 (top)
 *   evolution: 0 (genesis/left) to 1 (commodity/right)
 */
export function exportToOWM(
	graph: StrategicGraph,
	contextManager: MapContextManager,
	settings: WardleyMapVisualSettings,
): string | null {
	const context = contextManager.getCurrentMapContext()
		|| contextManager.getDefaultMapContext();
	if (!context) return null;

	const { components, edges } = buildPositionedMap(graph, contextManager, settings, context.id);
	if (components.length === 0) return null;

	const lines: string[] = [];
	lines.push(`title ${context.name}`);
	lines.push('');

	// Components
	for (const comp of components) {
		// Convert SVG coords to OWM [visibility, evolution]
		// SVG: x 80-720 (left to right), y 80-520 (top to bottom)
		const evolution = Math.max(0, Math.min(1, (comp.x - 80) / 640));
		const visibility = Math.max(0, Math.min(1, 1 - (comp.y - 80) / 440));

		const keyword = comp.strategic.type === 'user_need' ? 'anchor' : 'component';
		lines.push(`${keyword} ${comp.name} [${visibility.toFixed(2)}, ${evolution.toFixed(2)}]`);
	}

	lines.push('');

	// Dependencies
	for (const edge of edges) {
		if (edge.type === 'depends_on' || edge.type === 'enables') {
			const source = components.find(c => c.id === edge.source);
			const target = components.find(c => c.id === edge.target);
			if (source && target) {
				lines.push(`${source.name}->${target.name}`);
			}
		}
	}

	// Evolution arrows
	const evolveLines: string[] = [];
	for (const edge of edges) {
		if (edge.type === 'evolves_to') {
			const source = components.find(c => c.id === edge.source);
			const target = components.find(c => c.id === edge.target);
			if (source && target) {
				const targetEvolution = Math.max(0, Math.min(1, (target.x - 80) / 640));
				evolveLines.push(`evolve ${source.name} ${targetEvolution.toFixed(2)}`);
			}
		}
	}
	if (evolveLines.length > 0) {
		lines.push('');
		lines.push(...evolveLines);
	}

	return lines.join('\n');
}

/**
 * Export the current map as a standalone SVG string.
 */
export function exportToSVG(
	graph: StrategicGraph,
	contextManager: MapContextManager,
	settings: WardleyMapVisualSettings,
): string | null {
	const context = contextManager.getCurrentMapContext()
		|| contextManager.getDefaultMapContext();
	if (!context) return null;

	const { components, edges } = buildPositionedMap(graph, contextManager, settings, context.id);
	if (components.length === 0) return null;

	return buildSVGString(components, edges, settings, context.name);
}

// --- Shared helpers ---

function buildPositionedMap(
	graph: StrategicGraph,
	contextManager: MapContextManager,
	settings: WardleyMapVisualSettings,
	mapId: string,
): { components: ComponentNode[]; edges: ComponentEdge[] } {
	const componentIds = contextManager.getComponentsForMap(mapId);
	const components: ComponentNode[] = [];

	for (const id of componentIds) {
		const node = graph.getNode(id);
		if (!node?.strategic) continue;
		components.push({
			id,
			name: id.split('/').pop()?.replace('.md', '') || id,
			strategic: node.strategic,
			x: 0,
			y: 0,
		});
	}

	const edges: ComponentEdge[] = [];
	const componentIdSet = new Set(components.map(c => c.id));
	graph.forEachEdge((edge) => {
		if (componentIdSet.has(edge.source) && componentIdSet.has(edge.target)) {
			edges.push({ source: edge.source, target: edge.target, type: edge.field });
		}
	});

	const positioner = new WardleyPositioner(settings);
	const positioned = positioner.position(components, edges);

	return { components: positioned, edges };
}

function buildSVGString(
	components: ComponentNode[],
	edges: ComponentEdge[],
	settings: WardleyMapVisualSettings,
	title: string,
): string {
	const lines: string[] = [];
	lines.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">');
	lines.push('<style>');
	lines.push('  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }');
	lines.push('  .wardley-component { cursor: pointer; }');
	lines.push('</style>');

	// Background
	lines.push('<rect width="800" height="600" fill="#1e1e2e"/>');

	// Arrow marker
	lines.push('<defs>');
	lines.push('  <marker id="evo-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">');
	lines.push('    <path d="M0,0 L0,6 L9,3 z" fill="#b48ead"/>');
	lines.push('  </marker>');
	lines.push('</defs>');

	// Axes
	lines.push('<line x1="80" y1="50" x2="80" y2="550" stroke="#6c7086" stroke-width="2"/>');
	lines.push('<line x1="80" y1="550" x2="750" y2="550" stroke="#6c7086" stroke-width="2"/>');

	// Axis labels
	lines.push('<text x="50" y="300" text-anchor="middle" fill="#6c7086" font-size="14" transform="rotate(-90, 50, 300)">Value Chain</text>');
	lines.push('<text x="415" y="590" text-anchor="middle" fill="#6c7086" font-size="14">Evolution</text>');

	// Stage labels and grid
	const stages = ['Genesis', 'Custom', 'Product', 'Commodity'];
	const centers = [0.125, 0.375, 0.625, 0.875];
	for (let i = 0; i < stages.length; i++) {
		const x = 80 + centers[i] * 640;
		lines.push(`<line x1="${x}" y1="50" x2="${x}" y2="550" stroke="#6c7086" stroke-width="1" stroke-dasharray="2,3" opacity="0.5"/>`);
		lines.push(`<line x1="${x}" y1="545" x2="${x}" y2="555" stroke="#6c7086" stroke-width="1"/>`);
		lines.push(`<text x="${x}" y="575" text-anchor="middle" fill="#6c7086" font-size="12">${stages[i]}</text>`);
	}

	// Title
	lines.push(`<text x="400" y="30" text-anchor="middle" fill="#cdd6f4" font-size="16" font-weight="600">${escapeXml(title)}</text>`);

	// Edges
	const edgeColors: Record<string, string> = {
		depends_on: '#89b4fa',
		enables: '#a6e3a1',
		constrains: '#f38ba8',
		evolves_to: '#b48ead',
		evolved_from: '#b48ead',
	};
	const radius = settings.node_size;

	for (const edge of edges) {
		const source = components.find(c => c.id === edge.source);
		const target = components.find(c => c.id === edge.target);
		if (!source || !target) continue;

		const { x1, y1, x2, y2 } = clipLine(source.x, source.y, target.x, target.y, radius);
		const color = edgeColors[edge.type] || '#6c7086';
		const dash = edge.type === 'constrains' ? ' stroke-dasharray="5,5"' :
			(edge.type === 'evolves_to' || edge.type === 'evolved_from') ? ' stroke-dasharray="3,3"' : '';
		const marker = edge.type === 'evolves_to' ? ' marker-end="url(#evo-arrow)"' : '';

		lines.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${settings.edge_thickness}"${dash}${marker}/>`);
	}

	// Components
	const importanceColors: Record<string, string> = {
		critical: '#f38ba8',
		important: '#fab387',
		supporting: '#89b4fa',
		optional: '#6c7086',
	};

	for (const comp of components) {
		const importance = comp.strategic.strategic_importance || 'supporting';
		const fill = importanceColors[importance] || importanceColors.supporting;

		lines.push(`<circle cx="${comp.x.toFixed(1)}" cy="${comp.y.toFixed(1)}" r="${radius}" fill="${fill}" stroke="#cdd6f4" stroke-width="2" class="wardley-component"/>`);
		lines.push(`<text x="${comp.x.toFixed(1)}" y="${(comp.y + radius + 13).toFixed(1)}" text-anchor="middle" fill="#cdd6f4" font-size="${settings.font_size}">${escapeXml(comp.name)}</text>`);
	}

	lines.push('</svg>');
	return lines.join('\n');
}

function clipLine(sx: number, sy: number, tx: number, ty: number, r: number) {
	const dx = tx - sx;
	const dy = ty - sy;
	const dist = Math.sqrt(dx * dx + dy * dy);
	if (dist <= r * 2) return { x1: sx, y1: sy, x2: tx, y2: ty };
	const ux = dx / dist;
	const uy = dy / dist;
	return { x1: sx + ux * r, y1: sy + uy * r, x2: tx - ux * r, y2: ty - uy * r };
}

function escapeXml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
