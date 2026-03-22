import type { StrategicGraph } from "./graph";
import type { MapContextManager } from "./map-context";
import type { MapContext, AnalysisResult, StrategicValidationWarning, StrategicInsight, ComponentNode, ComponentEdge, WardleyMapVisualSettings } from "./types";
import { StrategicAnalyzer } from "./analyzer";
import { WardleyPositioner } from "./positioner";

/**
 * Generates a markdown report for a map context.
 */
export function generateReport(
	graph: StrategicGraph,
	contextManager: MapContextManager,
	settings: WardleyMapVisualSettings,
	checkNoteExists: (name: string) => boolean,
): { content: string; filename: string } | null {
	const context = contextManager.getCurrentMapContext()
		|| contextManager.getDefaultMapContext();
	if (!context) return null;

	const analyzer = new StrategicAnalyzer(graph, checkNoteExists);
	const componentIds = contextManager.getComponentsForMap(context.id);
	const result = analyzer.analyze(componentIds);

	const { components, edges } = buildPositionedComponents(graph, contextManager, settings, context.id);

	const lines: string[] = [];

	// Header
	lines.push(`# ${context.name} - Strategic Report`);
	lines.push('');
	lines.push(`> Generated ${new Date().toISOString().split('T')[0]}. Scope: ${context.scope}.`);
	lines.push('');

	// Summary
	lines.push('## Summary');
	lines.push('');
	lines.push(`| Metric | Count |`);
	lines.push(`|--------|-------|`);
	lines.push(`| Components | ${result.summary.total_components} |`);
	lines.push(`| Warnings | ${result.warnings.length} |`);
	lines.push(`| Insights | ${result.insights.length} |`);
	lines.push('');

	// Evolution distribution
	if (Object.keys(result.summary.by_evolution).length > 0) {
		lines.push('### Evolution Distribution');
		lines.push('');
		lines.push('| Stage | Count |');
		lines.push('|-------|-------|');
		for (const [stage, count] of Object.entries(result.summary.by_evolution)) {
			lines.push(`| ${stage} | ${count} |`);
		}
		lines.push('');
	}

	// Importance distribution
	if (Object.keys(result.summary.by_importance).length > 0) {
		lines.push('### Importance Distribution');
		lines.push('');
		lines.push('| Level | Count |');
		lines.push('|-------|-------|');
		for (const [level, count] of Object.entries(result.summary.by_importance)) {
			lines.push(`| ${level} | ${count} |`);
		}
		lines.push('');
	}

	// Components table
	lines.push('## Components');
	lines.push('');
	lines.push('| Component | Type | Evolution | Importance | Confidence |');
	lines.push('|-----------|------|-----------|------------|------------|');
	for (const comp of components) {
		const s = comp.strategic;
		const link = `[[${comp.name}]]`;
		lines.push(`| ${link} | ${s.type || '-'} | ${s.evolution_stage || '-'} | ${s.strategic_importance || '-'} | ${s.confidence_level || '-'} |`);
	}
	lines.push('');

	// Value chain (dependency structure)
	const depEdges = edges.filter(e => e.type === 'depends_on' || e.type === 'enables');
	if (depEdges.length > 0) {
		lines.push('## Value Chain');
		lines.push('');
		for (const edge of depEdges) {
			const sourceName = getName(edge.source);
			const targetName = getName(edge.target);
			if (edge.type === 'depends_on') {
				lines.push(`- [[${sourceName}]] depends on [[${targetName}]]`);
			} else {
				lines.push(`- [[${sourceName}]] enables [[${targetName}]]`);
			}
		}
		lines.push('');
	}

	// Evolution
	const evoEdges = edges.filter(e => e.type === 'evolves_to' || e.type === 'evolved_from');
	if (evoEdges.length > 0) {
		lines.push('## Evolution');
		lines.push('');
		for (const edge of evoEdges) {
			const sourceName = getName(edge.source);
			const targetName = getName(edge.target);
			if (edge.type === 'evolves_to') {
				lines.push(`- [[${sourceName}]] evolves to [[${targetName}]]`);
			} else {
				lines.push(`- [[${sourceName}]] evolved from [[${targetName}]]`);
			}
		}
		lines.push('');
	}

	// Insights
	if (result.insights.length > 0) {
		lines.push('## Strategic Insights');
		lines.push('');
		for (const insight of result.insights) {
			lines.push(`### ${getInsightLabel(insight.type)} (${insight.priority})`);
			lines.push('');
			lines.push(insight.message);
			lines.push('');
			if (insight.affected_components.length > 0) {
				lines.push('Affected:');
				for (const path of insight.affected_components) {
					lines.push(`- [[${getName(path)}]]`);
				}
				lines.push('');
			}
		}
	}

	// Warnings
	if (result.warnings.length > 0) {
		lines.push('## Validation Warnings');
		lines.push('');
		for (const warning of result.warnings) {
			lines.push(`- **${getWarningLabel(warning.type)}** (${warning.severity}): ${warning.message} - [[${getName(warning.component_path)}]]`);
		}
		lines.push('');
	}

	// Build filename from context
	const filename = buildFilename(context);

	return { content: lines.join('\n'), filename };
}

function buildPositionedComponents(
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
			name: getName(id),
			strategic: node.strategic,
			x: 0,
			y: 0,
		});
	}

	const edges: ComponentEdge[] = [];
	const idSet = new Set(components.map(c => c.id));
	graph.forEachEdge((edge) => {
		if (idSet.has(edge.source) && idSet.has(edge.target)) {
			edges.push({ source: edge.source, target: edge.target, type: edge.field });
		}
	});

	const positioner = new WardleyPositioner(settings);
	const positioned = positioner.position(components, edges);
	return { components: positioned, edges };
}

function buildFilename(context: MapContext): string {
	const slug = context.name
		.replace(/[^a-zA-Z0-9-_ ]/g, '')
		.replace(/\s+/g, '-')
		.toLowerCase();

	if (context.scope === 'folder' && context.includes && context.includes.length > 0) {
		return `${context.includes[0]}/${slug}-report.md`;
	}
	return `${slug}-report.md`;
}

function getName(path: string): string {
	return path.split('/').pop()?.replace('.md', '') || path;
}

function getInsightLabel(type: string): string {
	const labels: Record<string, string> = {
		orphaned_component: 'Orphaned Components',
		critical_path: 'Critical Path',
		evolution_gap: 'Evolution Gap',
		dependency_risk: 'Dependency Risk',
	};
	return labels[type] || type.replace(/_/g, ' ');
}

function getWarningLabel(type: string): string {
	const labels: Record<string, string> = {
		low_confidence: 'Low Confidence',
		missing_evidence: 'Missing Evidence',
		outdated_validation: 'Outdated Validation',
		evolution_inconsistency: 'Evolution Inconsistency',
	};
	return labels[type] || type.replace(/_/g, ' ');
}
