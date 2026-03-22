// Strategic component types
export const STRATEGIC_TYPES = [
	"component",
	"user_need",
	"capability",
	"product",
	"service",
] as const;

export type StrategicType = (typeof STRATEGIC_TYPES)[number];

// Evolution stages (X-axis of Wardley map)
export const EVOLUTION_STAGES = [
	"genesis",
	"custom",
	"product",
	"commodity",
] as const;

export type EvolutionStage = (typeof EVOLUTION_STAGES)[number];

// Strategic importance levels
export const STRATEGIC_IMPORTANCE = [
	"critical",
	"important",
	"supporting",
	"optional",
] as const;

export type StrategicImportance = (typeof STRATEGIC_IMPORTANCE)[number];

// Confidence levels
export const CONFIDENCE_LEVELS = [
	"high",
	"medium",
	"low",
] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

// Strategic metadata extracted from note frontmatter
export interface StrategicAttributes {
	type?: StrategicType;
	evolution_stage?: EvolutionStage;
	strategic_importance?: StrategicImportance;
	confidence_level?: ConfidenceLevel;
	evidence_sources?: string[];
	last_validated?: string;
	strategic_maps?: string[];
}

// Map context (vault-wide, folder-scoped, or membership-based)
export interface MapContext {
	id: string;
	name: string;
	scope: "vault" | "folder" | "membership";
	description?: string;
	includes?: string[];
}

// Analysis output types
export interface StrategicValidationWarning {
	type: "low_confidence" | "missing_evidence" | "outdated_validation" | "evolution_inconsistency";
	message: string;
	component_path: string;
	severity: "high" | "medium" | "low";
}

export interface StrategicInsight {
	type: "orphaned_component" | "critical_path" | "evolution_gap" | "dependency_risk";
	message: string;
	affected_components: string[];
	priority: "high" | "medium" | "low";
}

// Graph node (one per vault note with strategic frontmatter)
export interface StrategicNode {
	id: string;
	resolved: boolean;
	strategic?: StrategicAttributes;
}

// Edge types (frontmatter relationship fields)
export const EDGE_TYPES = [
	"depends_on",
	"enables",
	"constrains",
	"evolves_to",
	"evolved_from",
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

// Graph edge (one per relationship between notes)
export interface StrategicEdge {
	source: string;
	target: string;
	field: EdgeType;
}

// Positioned component for rendering
export interface ComponentNode {
	id: string;
	name: string;
	strategic: StrategicAttributes;
	x: number;
	y: number;
}

// Edge between positioned components
export interface ComponentEdge {
	source: string;
	target: string;
	type: EdgeType;
}

// Visual settings for the Wardley map
export interface WardleyMapVisualSettings {
	font_size: number;
	node_size: number;
	node_colors: {
		critical: string;
		important: string;
		supporting: string;
		optional: string;
	};
	show_evolution_grid: boolean;
	show_axis_labels: boolean;
	edge_thickness: number;
	component_spacing: number;
	grid_color: string;
	grid_opacity: number;
}

// Default visual settings
export const DEFAULT_VISUAL_SETTINGS: WardleyMapVisualSettings = {
	font_size: 11,
	node_size: 12,
	node_colors: {
		critical: "var(--color-red)",
		important: "var(--color-orange)",
		supporting: "var(--color-blue)",
		optional: "var(--color-base-40)",
	},
	show_evolution_grid: true,
	show_axis_labels: true,
	edge_thickness: 2,
	component_spacing: 80,
	grid_color: "var(--text-muted)",
	grid_opacity: 0.5,
};

// Frontmatter fields that produce graph edges
export const RELATIONSHIP_FIELDS: readonly EdgeType[] = EDGE_TYPES;

// Strategic frontmatter field names
export const STRATEGIC_FIELDS = [
	"type",
	"evolution_stage",
	"strategic_importance",
	"confidence_level",
	"evidence_sources",
	"last_validated",
	"strategic_maps",
] as const;

// Scanner warning for malformed notes
export interface ScanWarning {
	path: string;
	problems: string[];
}

// Analysis summary
export interface AnalysisSummary {
	total_components: number;
	by_evolution: Record<string, number>;
	by_importance: Record<string, number>;
	by_confidence: Record<string, number>;
}

export interface AnalysisResult {
	warnings: StrategicValidationWarning[];
	insights: StrategicInsight[];
	summary: AnalysisSummary;
}
