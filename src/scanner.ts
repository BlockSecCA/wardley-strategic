import { TFile, App, CachedMetadata } from "obsidian";
import { StrategicGraph } from "./graph";
import type { StrategicAttributes, StrategicType, EvolutionStage, StrategicImportance, ConfidenceLevel, EdgeType, ScanWarning } from "./types";
import { STRATEGIC_TYPES, EVOLUTION_STAGES, STRATEGIC_IMPORTANCE, CONFIDENCE_LEVELS, RELATIONSHIP_FIELDS } from "./types";

export interface ScanResult {
	graph: StrategicGraph;
	warnings: ScanWarning[];
}

/**
 * Scans vault notes for strategic frontmatter and builds the graph.
 * Uses Obsidian's metadataCache for frontmatter reading and link resolution.
 */
export class VaultScanner {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	scanVault(): ScanResult {
		const graph = new StrategicGraph();
		const warnings: ScanWarning[] = [];
		const files = this.app.vault.getMarkdownFiles();

		// Pass 1: add nodes
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const { strategic, problems } = this.extractStrategicMetadata(cache);

			if (problems.length > 0) {
				warnings.push({ path: file.path, problems });
			}

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
						const { strategic: targetStrategic } = this.extractStrategicMetadata(targetCache);
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

		return { graph, warnings };
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
	 * Returns the extracted metadata and any problems found.
	 */
	extractStrategicMetadata(cache: CachedMetadata | null | undefined): {
		strategic: StrategicAttributes | undefined;
		problems: string[];
	} {
		const empty = { strategic: undefined, problems: [] };
		if (!cache?.frontmatter) return empty;

		const fm = cache.frontmatter;

		// Only process notes that explicitly opt in
		if (fm.wardley !== true) return empty;

		const strategic: StrategicAttributes = {};
		const problems: string[] = [];

		// Type
		if (fm.type != null) {
			if (STRATEGIC_TYPES.includes(fm.type as StrategicType)) {
				strategic.type = fm.type as StrategicType;
			} else {
				problems.push(`Invalid type "${fm.type}". Expected: ${STRATEGIC_TYPES.join(', ')}`);
			}
		}

		// Evolution stage
		if (fm.evolution_stage != null) {
			if (EVOLUTION_STAGES.includes(fm.evolution_stage as EvolutionStage)) {
				strategic.evolution_stage = fm.evolution_stage as EvolutionStage;
			} else {
				problems.push(`Invalid evolution_stage "${fm.evolution_stage}". Expected: ${EVOLUTION_STAGES.join(', ')}`);
			}
		}

		// Strategic importance
		if (fm.strategic_importance != null) {
			if (STRATEGIC_IMPORTANCE.includes(fm.strategic_importance as StrategicImportance)) {
				strategic.strategic_importance = fm.strategic_importance as StrategicImportance;
			} else {
				problems.push(`Invalid strategic_importance "${fm.strategic_importance}". Expected: ${STRATEGIC_IMPORTANCE.join(', ')}`);
			}
		}

		// Confidence level
		if (fm.confidence_level != null) {
			if (CONFIDENCE_LEVELS.includes(fm.confidence_level as ConfidenceLevel)) {
				strategic.confidence_level = fm.confidence_level as ConfidenceLevel;
			} else {
				problems.push(`Invalid confidence_level "${fm.confidence_level}". Expected: ${CONFIDENCE_LEVELS.join(', ')}`);
			}
		}

		// Evidence sources
		if (fm.evidence_sources) {
			strategic.evidence_sources = Array.isArray(fm.evidence_sources)
				? fm.evidence_sources
				: [fm.evidence_sources];
		}

		// Last validated (Obsidian may parse YYYY-MM-DD as a Date object)
		if (fm.last_validated != null) {
			if (fm.last_validated instanceof Date) {
				strategic.last_validated = fm.last_validated.toISOString().split('T')[0];
			} else if (typeof fm.last_validated === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fm.last_validated)) {
				strategic.last_validated = fm.last_validated;
			} else {
				problems.push(`Invalid last_validated "${fm.last_validated}". Expected: YYYY-MM-DD`);
			}
		}

		// Strategic maps
		if (fm.strategic_maps) {
			strategic.strategic_maps = Array.isArray(fm.strategic_maps)
				? fm.strategic_maps
				: [fm.strategic_maps];
		}

		// wardley: true but nothing valid extracted
		if (Object.keys(strategic).length === 0) {
			problems.push('No valid strategic fields found. Note is skipped.');
			return { strategic: undefined, problems };
		}

		// Missing evolution_stage means the note can't be positioned on the map
		if (!strategic.evolution_stage) {
			problems.push('Missing evolution_stage. Component will appear but may be mispositioned.');
		}

		return { strategic, problems };
	}
}
