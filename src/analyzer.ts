import type { StrategicGraph } from "./graph";
import type {
	StrategicValidationWarning,
	StrategicInsight,
	StrategicAttributes,
	AnalysisResult,
	AnalysisSummary,
} from "./types";

interface AnalyzableComponent {
	id: string;
	strategic: StrategicAttributes;
}

/**
 * Generates validation warnings and strategic insights from the graph.
 * Operates on a component list (scoped by map context) and the full graph (for edges).
 */
export class StrategicAnalyzer {
	private graph: StrategicGraph;
	private checkNoteExists: ((noteName: string) => boolean) | null;

	constructor(graph: StrategicGraph, checkNoteExists?: (noteName: string) => boolean) {
		this.graph = graph;
		this.checkNoteExists = checkNoteExists ?? null;
	}

	analyze(componentIds: string[]): AnalysisResult {
		const components: AnalyzableComponent[] = [];
		for (const id of componentIds) {
			const node = this.graph.getNode(id);
			if (node?.strategic) {
				components.push({ id, strategic: node.strategic });
			}
		}

		const warnings = this.generateValidationWarnings(components);
		const insights = this.generateStrategicInsights(components);
		const summary = this.generateSummary(components);

		return { warnings, insights, summary };
	}

	private generateValidationWarnings(components: AnalyzableComponent[]): StrategicValidationWarning[] {
		const warnings: StrategicValidationWarning[] = [];

		for (const { id, strategic } of components) {
			// Low confidence warning
			if (strategic.confidence_level === 'low') {
				warnings.push({
					type: 'low_confidence',
					message: 'Component has low confidence rating',
					component_path: id,
					severity: 'medium',
				});
			}

			// Missing evidence warning
			if (!strategic.evidence_sources || strategic.evidence_sources.length === 0) {
				warnings.push({
					type: 'missing_evidence',
					message: 'Component lacks evidence sources',
					component_path: id,
					severity: 'medium',
				});
			} else if (this.checkNoteExists) {
				const missing = this.findMissingEvidenceNotes(strategic.evidence_sources);
				if (missing.length > 0) {
					warnings.push({
						type: 'missing_evidence',
						message: `Referenced evidence notes don't exist: ${missing.join(', ')}`,
						component_path: id,
						severity: 'low',
					});
				}
			}

			// Outdated validation warning
			if (strategic.last_validated) {
				const validatedDate = new Date(strategic.last_validated);
				const now = new Date();
				const monthsOld = (now.getTime() - validatedDate.getTime()) / (1000 * 60 * 60 * 24 * 30);

				if (monthsOld > 6) {
					warnings.push({
						type: 'outdated_validation',
						message: `Component hasn't been validated in ${Math.floor(monthsOld)} months`,
						component_path: id,
						severity: monthsOld > 12 ? 'high' : 'medium',
					});
				}
			} else {
				warnings.push({
					type: 'outdated_validation',
					message: 'Component has no validation date',
					component_path: id,
					severity: 'low',
				});
			}

			// Evolution inconsistency
			if (strategic.type && strategic.evolution_stage) {
				const inconsistencies = this.checkEvolutionConsistency(
					strategic.type, strategic.evolution_stage
				);
				if (inconsistencies.length > 0) {
					warnings.push({
						type: 'evolution_inconsistency',
						message: `Evolution stage may be inconsistent: ${inconsistencies.join(', ')}`,
						component_path: id,
						severity: 'low',
					});
				}
			}
		}

		return warnings.sort((a, b) => {
			const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
			return (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0);
		});
	}

	private checkEvolutionConsistency(type: string, evolution_stage: string): string[] {
		const inconsistencies: string[] = [];

		const expectations: Record<string, string[]> = {
			user_need: ['genesis', 'custom'],
			capability: ['custom', 'product'],
			component: ['product', 'commodity'],
			service: ['product', 'commodity'],
			product: ['custom', 'product'],
		};

		const expected = expectations[type];
		if (expected && !expected.includes(evolution_stage)) {
			inconsistencies.push(
				`${type} components typically exist in ${expected.join(' or ')} stages`
			);
		}

		return inconsistencies;
	}

	private generateStrategicInsights(components: AnalyzableComponent[]): StrategicInsight[] {
		const insights: StrategicInsight[] = [];

		const orphaned = this.findOrphanedComponents(components);
		if (orphaned.length > 0) {
			insights.push({
				type: 'orphaned_component',
				message: `${orphaned.length} component(s) have no strategic relationships`,
				affected_components: orphaned,
				priority: 'medium',
			});
		}

		const criticalPath = this.findCriticalPath(components);
		if (criticalPath.length > 0) {
			insights.push({
				type: 'critical_path',
				message: `${criticalPath.length} component(s) are on the critical path`,
				affected_components: criticalPath,
				priority: 'high',
			});
		}

		const evolutionGaps = this.findEvolutionGaps(components);
		if (evolutionGaps.length > 0) {
			insights.push({
				type: 'evolution_gap',
				message: `Potential evolution gaps detected in ${evolutionGaps.length} areas`,
				affected_components: evolutionGaps,
				priority: 'medium',
			});
		}

		const dependencyRisks = this.findDependencyRisks(components);
		if (dependencyRisks.length > 0) {
			insights.push({
				type: 'dependency_risk',
				message: `${dependencyRisks.length} component(s) have high dependency risk`,
				affected_components: dependencyRisks,
				priority: 'high',
			});
		}

		return insights.sort((a, b) => {
			const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
			return (priorityOrder[b.priority] ?? 0) - (priorityOrder[a.priority] ?? 0);
		});
	}

	private findOrphanedComponents(components: AnalyzableComponent[]): string[] {
		const componentIds = new Set(components.map(c => c.id));
		const connected = new Set<string>();

		this.graph.forEachEdge((edge) => {
			if (componentIds.has(edge.source) && componentIds.has(edge.target)) {
				connected.add(edge.source);
				connected.add(edge.target);
			}
		});

		return components
			.filter(comp => !connected.has(comp.id))
			.map(comp => comp.id);
	}

	private findCriticalPath(components: AnalyzableComponent[]): string[] {
		const critical: string[] = [];
		const componentIds = new Set(components.map(c => c.id));

		for (const { id, strategic } of components) {
			if (strategic.strategic_importance === 'critical') {
				critical.push(id);
				continue;
			}

			// Count how many other components depend on this one
			let dependencyCount = 0;
			this.graph.forEachEdge((edge) => {
				if (!componentIds.has(edge.source) || !componentIds.has(edge.target)) return;
				if (edge.target === id && edge.field === 'depends_on') {
					dependencyCount++;
				} else if (edge.source === id && edge.field === 'enables') {
					dependencyCount++;
				}
			});

			if (dependencyCount >= 3) {
				critical.push(id);
			}
		}

		return critical;
	}

	/**
	 * Find evolution gaps: a more-evolved component depending on a much less-evolved one.
	 *
	 * In Wardley maps, a "depends_on" edge means the source (note with the field)
	 * depends on the target. Normal: user_need (genesis) depends_on component (commodity).
	 * Abnormal: commodity depends_on genesis with a gap > 1 stage, suggesting
	 * missing intermediate layers.
	 *
	 * The original breadcrumbs code had this comparison backwards.
	 */
	private findEvolutionGaps(components: AnalyzableComponent[]): string[] {
		const gaps: string[] = [];
		const componentIds = new Set(components.map(c => c.id));
		const componentMap = new Map(components.map(c => [c.id, c]));

		const evolutionOrder = ['genesis', 'custom', 'product', 'commodity'];

		this.graph.forEachEdge((edge) => {
			if (!componentIds.has(edge.source) || !componentIds.has(edge.target)) return;
			if (edge.field !== 'depends_on') return;

			const sourceComp = componentMap.get(edge.source);
			const targetComp = componentMap.get(edge.target);

			if (!sourceComp?.strategic.evolution_stage || !targetComp?.strategic.evolution_stage) return;

			const sourceIndex = evolutionOrder.indexOf(sourceComp.strategic.evolution_stage);
			const targetIndex = evolutionOrder.indexOf(targetComp.strategic.evolution_stage);

			// Flag when the source (dependent) is more evolved than the target (dependency)
			// with a gap > 1 stage. e.g., a commodity depending on genesis.
			// Normal pattern is less-evolved depending on more-evolved (user_need -> commodity).
			if (sourceIndex > targetIndex && sourceIndex - targetIndex > 1) {
				gaps.push(edge.source);
			}
		});

		return [...new Set(gaps)];
	}

	private findDependencyRisks(components: AnalyzableComponent[]): string[] {
		const risks: string[] = [];
		const componentIds = new Set(components.map(c => c.id));
		const componentMap = new Map(components.map(c => [c.id, c]));

		this.graph.forEachEdge((edge) => {
			if (!componentIds.has(edge.source) || !componentIds.has(edge.target)) return;
			if (edge.field !== 'depends_on') return;

			const targetComp = componentMap.get(edge.target);
			if (!targetComp?.strategic) return;

			let isRisky = false;

			if (targetComp.strategic.confidence_level === 'low') {
				isRisky = true;
			}

			if (targetComp.strategic.last_validated) {
				const validatedDate = new Date(targetComp.strategic.last_validated);
				const now = new Date();
				const monthsOld = (now.getTime() - validatedDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
				if (monthsOld > 12) {
					isRisky = true;
				}
			}

			if (isRisky) {
				risks.push(edge.source);
			}
		});

		return [...new Set(risks)];
	}

	private findMissingEvidenceNotes(evidenceSources: string[]): string[] {
		if (!this.checkNoteExists) return [];
		const missing: string[] = [];

		for (const source of evidenceSources) {
			const noteMatch = source.match(/\[\[([^\]]+)\]\]/);
			if (noteMatch) {
				const noteName = noteMatch[1];
				if (!this.checkNoteExists(noteName)) {
					missing.push(noteName);
				}
			}
		}

		return missing;
	}

	private generateSummary(components: AnalyzableComponent[]): AnalysisSummary {
		const summary: AnalysisSummary = {
			total_components: components.length,
			by_evolution: {},
			by_importance: {},
			by_confidence: {},
		};

		for (const { strategic } of components) {
			const evolution = strategic.evolution_stage || 'unknown';
			summary.by_evolution[evolution] = (summary.by_evolution[evolution] || 0) + 1;

			const importance = strategic.strategic_importance || 'unknown';
			summary.by_importance[importance] = (summary.by_importance[importance] || 0) + 1;

			const confidence = strategic.confidence_level || 'unknown';
			summary.by_confidence[confidence] = (summary.by_confidence[confidence] || 0) + 1;
		}

		return summary;
	}
}
