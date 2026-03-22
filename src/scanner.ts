import { TFile, App, CachedMetadata } from "obsidian";
import { StrategicGraph } from "./graph";
import type { StrategicAttributes, StrategicType, EvolutionStage, StrategicImportance, ConfidenceLevel, EdgeType } from "./types";
import { STRATEGIC_TYPES, EVOLUTION_STAGES, STRATEGIC_IMPORTANCE, CONFIDENCE_LEVELS, RELATIONSHIP_FIELDS } from "./types";

/**
 * Scans vault notes for strategic frontmatter and builds the graph.
 * Uses Obsidian's metadataCache for frontmatter reading and link resolution.
 */
export class VaultScanner {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	scanVault(): StrategicGraph {
		const graph = new StrategicGraph();
		const files = this.app.vault.getMarkdownFiles();

		// Pass 1: add nodes
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const strategic = this.extractStrategicMetadata(cache);

			if (strategic) {
				graph.addNode(file.path, {
					id: file.path,
					resolved: true,
					strategic,
				});
			}
		}

		// Pass 2: add edges from frontmatterLinks
		for (const file of files) {
			if (!graph.hasNode(file.path)) continue;

			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache?.frontmatterLinks) continue;

			for (const link of cache.frontmatterLinks) {
				const field = this.extractFieldName(link.key);
				if (!field || !RELATIONSHIP_FIELDS.includes(field)) continue;

				const targetFile = this.app.metadataCache.getFirstLinkpathDest(
					link.link, file.path
				);

				if (targetFile instanceof TFile) {
					// Ensure target node exists (even if it lacks strategic metadata)
					if (!graph.hasNode(targetFile.path)) {
						const targetCache = this.app.metadataCache.getFileCache(targetFile);
						const targetStrategic = this.extractStrategicMetadata(targetCache);
						graph.addNode(targetFile.path, {
							id: targetFile.path,
							resolved: true,
							strategic: targetStrategic,
						});
					}
					graph.addEdge(file.path, targetFile.path, field);
				}
			}
		}

		return graph;
	}

	/**
	 * Extract the field name from a frontmatterLinks key.
	 * Keys look like "depends_on" or "depends_on.0" for array items.
	 */
	private extractFieldName(key: string): EdgeType | null {
		const baseName = key.split('.')[0];
		if (RELATIONSHIP_FIELDS.includes(baseName as EdgeType)) {
			return baseName as EdgeType;
		}
		return null;
	}

	/**
	 * Extract strategic metadata from a note's cached metadata.
	 * Requires `wardley: true` in frontmatter to opt in.
	 */
	extractStrategicMetadata(cache: CachedMetadata | null | undefined): StrategicAttributes | undefined {
		if (!cache?.frontmatter) return undefined;

		const fm = cache.frontmatter;

		// Discriminator: only process notes that explicitly opt in
		if (fm.wardley !== true) return undefined;

		const strategic: StrategicAttributes = {};

		// Type
		if (fm.type && STRATEGIC_TYPES.includes(fm.type as StrategicType)) {
			strategic.type = fm.type as StrategicType;
		}

		// Evolution stage
		if (fm.evolution_stage && EVOLUTION_STAGES.includes(fm.evolution_stage as EvolutionStage)) {
			strategic.evolution_stage = fm.evolution_stage as EvolutionStage;
		}

		// Strategic importance
		if (fm.strategic_importance && STRATEGIC_IMPORTANCE.includes(fm.strategic_importance as StrategicImportance)) {
			strategic.strategic_importance = fm.strategic_importance as StrategicImportance;
		}

		// Confidence level
		if (fm.confidence_level && CONFIDENCE_LEVELS.includes(fm.confidence_level as ConfidenceLevel)) {
			strategic.confidence_level = fm.confidence_level as ConfidenceLevel;
		}

		// Evidence sources
		if (fm.evidence_sources) {
			strategic.evidence_sources = Array.isArray(fm.evidence_sources)
				? fm.evidence_sources
				: [fm.evidence_sources];
		}

		// Last validated
		if (typeof fm.last_validated === 'string') {
			strategic.last_validated = fm.last_validated;
		}

		// Strategic maps
		if (fm.strategic_maps) {
			strategic.strategic_maps = Array.isArray(fm.strategic_maps)
				? fm.strategic_maps
				: [fm.strategic_maps];
		}

		return Object.keys(strategic).length > 0 ? strategic : undefined;
	}
}
