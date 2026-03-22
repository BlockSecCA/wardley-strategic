import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import pure TS modules (no Obsidian dependency)
import { StrategicGraph } from "./src/graph.ts";
import { WardleyPositioner } from "./src/positioner.ts";
import { StrategicAnalyzer } from "./src/analyzer.ts";
import type {
	StrategicNode,
	ComponentNode,
	ComponentEdge,
	WardleyMapVisualSettings,
	StrategicAttributes,
} from "./src/types.ts";
import {
	DEFAULT_VISUAL_SETTINGS,
	STRATEGIC_TYPES,
	EVOLUTION_STAGES,
	STRATEGIC_IMPORTANCE,
	CONFIDENCE_LEVELS,
	EDGE_TYPES,
} from "./src/types.ts";

// ============================================================
// Types
// ============================================================

describe("Types", () => {
	it("STRATEGIC_TYPES contains all expected values", () => {
		assert.deepEqual([...STRATEGIC_TYPES], ["component", "user_need", "capability", "product", "service"]);
	});

	it("EVOLUTION_STAGES contains all expected values", () => {
		assert.deepEqual([...EVOLUTION_STAGES], ["genesis", "custom", "product", "commodity"]);
	});

	it("STRATEGIC_IMPORTANCE contains all expected values", () => {
		assert.deepEqual([...STRATEGIC_IMPORTANCE], ["critical", "important", "supporting", "optional"]);
	});

	it("CONFIDENCE_LEVELS contains all expected values", () => {
		assert.deepEqual([...CONFIDENCE_LEVELS], ["high", "medium", "low"]);
	});

	it("EDGE_TYPES contains all expected values", () => {
		assert.deepEqual([...EDGE_TYPES], ["depends_on", "enables", "constrains", "evolves_to", "evolved_from"]);
	});

	it("DEFAULT_VISUAL_SETTINGS has all required fields", () => {
		assert.ok(DEFAULT_VISUAL_SETTINGS.font_size > 0);
		assert.ok(DEFAULT_VISUAL_SETTINGS.node_size > 0);
		assert.ok(DEFAULT_VISUAL_SETTINGS.node_colors.critical);
		assert.ok(DEFAULT_VISUAL_SETTINGS.node_colors.important);
		assert.ok(DEFAULT_VISUAL_SETTINGS.node_colors.supporting);
		assert.ok(DEFAULT_VISUAL_SETTINGS.node_colors.optional);
	});
});

// ============================================================
// Graph
// ============================================================

describe("StrategicGraph", () => {
	it("adds and retrieves nodes", () => {
		const g = new StrategicGraph();
		g.addNode("a.md", { id: "a.md", resolved: true, strategic: { type: "component" } });
		const node = g.getNode("a.md");
		assert.ok(node);
		assert.equal(node.strategic?.type, "component");
	});

	it("hasNode returns false for missing nodes", () => {
		const g = new StrategicGraph();
		assert.equal(g.hasNode("missing.md"), false);
	});

	it("nodeCount tracks additions", () => {
		const g = new StrategicGraph();
		assert.equal(g.nodeCount(), 0);
		g.addNode("a.md", { id: "a.md", resolved: true });
		assert.equal(g.nodeCount(), 1);
		g.addNode("b.md", { id: "b.md", resolved: true });
		assert.equal(g.nodeCount(), 2);
	});

	it("forEachNode iterates all nodes", () => {
		const g = new StrategicGraph();
		g.addNode("a.md", { id: "a.md", resolved: true });
		g.addNode("b.md", { id: "b.md", resolved: true });
		const ids: string[] = [];
		g.forEachNode((id) => ids.push(id));
		assert.deepEqual(ids.sort(), ["a.md", "b.md"]);
	});

	it("adds and retrieves edges", () => {
		const g = new StrategicGraph();
		g.addNode("a.md", { id: "a.md", resolved: true });
		g.addNode("b.md", { id: "b.md", resolved: true });
		g.addEdge("a.md", "b.md", "depends_on");
		assert.equal(g.edgeCount(), 1);
	});

	it("getOutEdges returns outgoing edges", () => {
		const g = new StrategicGraph();
		g.addNode("a.md", { id: "a.md", resolved: true });
		g.addNode("b.md", { id: "b.md", resolved: true });
		g.addEdge("a.md", "b.md", "depends_on");
		const out = g.getOutEdges("a.md");
		assert.equal(out.length, 1);
		assert.equal(out[0].target, "b.md");
		assert.equal(g.getOutEdges("b.md").length, 0);
	});

	it("getInEdges returns incoming edges", () => {
		const g = new StrategicGraph();
		g.addNode("a.md", { id: "a.md", resolved: true });
		g.addNode("b.md", { id: "b.md", resolved: true });
		g.addEdge("a.md", "b.md", "depends_on");
		const inEdges = g.getInEdges("b.md");
		assert.equal(inEdges.length, 1);
		assert.equal(inEdges[0].source, "a.md");
	});

	it("forEachEdge iterates all edges", () => {
		const g = new StrategicGraph();
		g.addNode("a.md", { id: "a.md", resolved: true });
		g.addNode("b.md", { id: "b.md", resolved: true });
		g.addNode("c.md", { id: "c.md", resolved: true });
		g.addEdge("a.md", "b.md", "depends_on");
		g.addEdge("b.md", "c.md", "enables");
		const fields: string[] = [];
		g.forEachEdge((edge) => fields.push(edge.field));
		assert.deepEqual(fields, ["depends_on", "enables"]);
	});

	it("getStrategicNodes filters non-strategic nodes", () => {
		const g = new StrategicGraph();
		g.addNode("a.md", { id: "a.md", resolved: true, strategic: { type: "component" } });
		g.addNode("b.md", { id: "b.md", resolved: true });
		g.addNode("c.md", { id: "c.md", resolved: true, strategic: { type: "user_need" } });
		const strategic = g.getStrategicNodes();
		assert.equal(strategic.length, 2);
	});

	it("clear resets all state", () => {
		const g = new StrategicGraph();
		g.addNode("a.md", { id: "a.md", resolved: true });
		g.addEdge("a.md", "a.md", "constrains");
		g.clear();
		assert.equal(g.nodeCount(), 0);
		assert.equal(g.edgeCount(), 0);
	});
});

// ============================================================
// Positioner
// ============================================================

function makeComp(id: string, stage: string, type?: string): ComponentNode {
	return {
		id,
		name: id.replace('.md', ''),
		strategic: {
			evolution_stage: stage as any,
			type: (type || 'component') as any,
		},
		x: 0,
		y: 0,
	};
}

describe("WardleyPositioner", () => {
	const positioner = new WardleyPositioner(DEFAULT_VISUAL_SETTINGS);

	it("positions by evolution stage on X-axis", () => {
		const comps = [
			makeComp("a.md", "genesis"),
			makeComp("b.md", "custom"),
			makeComp("c.md", "product"),
			makeComp("d.md", "commodity"),
		];
		const result = positioner.position(comps, []);
		// genesis < custom < product < commodity on X-axis
		assert.ok(result[0].x < result[1].x);
		assert.ok(result[1].x < result[2].x);
		assert.ok(result[2].x < result[3].x);
	});

	it("positions user_need at depth 0 (top of value chain)", () => {
		const comps = [
			makeComp("need.md", "genesis", "user_need"),
			makeComp("infra.md", "commodity", "component"),
		];
		const edges: ComponentEdge[] = [
			{ source: "need.md", target: "infra.md", type: "depends_on" },
		];
		const result = positioner.position(comps, edges);
		// User need should be above (lower Y) infrastructure
		assert.ok(result[0].y < result[1].y);
	});

	it("dependency chain creates increasing depth", () => {
		const comps = [
			makeComp("a.md", "genesis", "user_need"),
			makeComp("b.md", "custom"),
			makeComp("c.md", "commodity"),
		];
		const edges: ComponentEdge[] = [
			{ source: "a.md", target: "b.md", type: "depends_on" },
			{ source: "b.md", target: "c.md", type: "depends_on" },
		];
		const result = positioner.position(comps, edges);
		assert.ok(result[0].y < result[1].y);
		assert.ok(result[1].y < result[2].y);
	});

	it("enables edges create correct depth direction", () => {
		const comps = [
			makeComp("user.md", "genesis", "user_need"),
			makeComp("infra.md", "commodity"),
		];
		const edges: ComponentEdge[] = [
			{ source: "infra.md", target: "user.md", type: "enables" },
		];
		const result = positioner.position(comps, edges);
		// enables reverses direction: infra enables user, so infra is deeper
		assert.ok(result[0].y < result[1].y);
	});

	it("evolution pairs share Y coordinate", () => {
		const comps = [
			makeComp("kettle.md", "custom"),
			makeComp("electric.md", "product"),
		];
		const edges: ComponentEdge[] = [
			{ source: "kettle.md", target: "electric.md", type: "evolves_to" },
		];
		const result = positioner.position(comps, edges);
		assert.equal(result[0].y, result[1].y);
	});

	it("disconnected components get stage-based depth", () => {
		const comps = [
			makeComp("a.md", "genesis", "user_need"),
			makeComp("b.md", "commodity"),
			makeComp("disconnected.md", "custom"),
		];
		const edges: ComponentEdge[] = [
			{ source: "a.md", target: "b.md", type: "depends_on" },
		];
		const result = positioner.position(comps, edges);
		// Disconnected component should still get a Y position
		assert.ok(result[2].y > 0);
	});

	it("empty graph produces no errors", () => {
		const result = positioner.position([], []);
		assert.deepEqual(result, []);
	});

	it("single component is centered vertically", () => {
		const comps = [makeComp("solo.md", "custom")];
		const result = positioner.position(comps, []);
		// Single component with no edges: centered at MARGIN + CONTENT_HEIGHT/2
		assert.ok(result[0].y > 200 && result[0].y < 400);
	});

	it("components within canvas bounds", () => {
		const comps = [
			makeComp("a.md", "genesis"),
			makeComp("b.md", "commodity"),
			makeComp("c.md", "custom"),
			makeComp("d.md", "product"),
		];
		const edges: ComponentEdge[] = [
			{ source: "a.md", target: "b.md", type: "depends_on" },
			{ source: "a.md", target: "c.md", type: "depends_on" },
			{ source: "c.md", target: "d.md", type: "depends_on" },
		];
		const result = positioner.position(comps, edges);
		for (const comp of result) {
			assert.ok(comp.x >= 80 && comp.x <= 720, `X out of bounds: ${comp.x}`);
			assert.ok(comp.y >= 80 && comp.y <= 520, `Y out of bounds: ${comp.y}`);
		}
	});

	it("longestPathFromRoot computes correct depths", () => {
		const comps = [
			makeComp("root.md", "genesis", "user_need"),
			makeComp("mid.md", "custom"),
			makeComp("leaf.md", "commodity"),
		];
		const edges: ComponentEdge[] = [
			{ source: "root.md", target: "mid.md", type: "depends_on" },
			{ source: "mid.md", target: "leaf.md", type: "depends_on" },
		];
		const depths = positioner.longestPathFromRoot(comps, edges);
		assert.equal(depths.get("root.md"), 0);
		assert.equal(depths.get("mid.md"), 1);
		assert.equal(depths.get("leaf.md"), 2);
	});
});

// ============================================================
// Analyzer
// ============================================================

function buildGraph(
	nodes: Array<{ id: string; strategic: StrategicAttributes }>,
	edges: Array<{ source: string; target: string; field: string }>,
): StrategicGraph {
	const g = new StrategicGraph();
	for (const n of nodes) {
		g.addNode(n.id, { id: n.id, resolved: true, strategic: n.strategic });
	}
	for (const e of edges) {
		g.addEdge(e.source, e.target, e.field as any);
	}
	return g;
}

describe("StrategicAnalyzer", () => {
	describe("Validation Warnings", () => {
		it("flags low confidence components", () => {
			const g = buildGraph([
				{ id: "a.md", strategic: { confidence_level: "low", evolution_stage: "custom" } },
			], []);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md"]);
			const lowConf = result.warnings.filter(w => w.type === "low_confidence");
			assert.equal(lowConf.length, 1);
		});

		it("flags missing evidence", () => {
			const g = buildGraph([
				{ id: "a.md", strategic: { evolution_stage: "custom" } },
			], []);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md"]);
			const missing = result.warnings.filter(w =>
				w.type === "missing_evidence" && w.message === "Component lacks evidence sources"
			);
			assert.equal(missing.length, 1);
		});

		it("flags missing evidence notes when checker provided", () => {
			const g = buildGraph([
				{ id: "a.md", strategic: { evidence_sources: ["[[Missing Note]]"], evolution_stage: "custom" } },
			], []);
			const analyzer = new StrategicAnalyzer(g, () => false);
			const result = analyzer.analyze(["a.md"]);
			const missing = result.warnings.filter(w =>
				w.type === "missing_evidence" && w.message.includes("Missing Note")
			);
			assert.equal(missing.length, 1);
		});

		it("flags outdated validation (high severity > 12 months)", () => {
			const old = new Date();
			old.setMonth(old.getMonth() - 14);
			const g = buildGraph([
				{ id: "a.md", strategic: { last_validated: old.toISOString().split('T')[0], evolution_stage: "custom" } },
			], []);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md"]);
			const outdated = result.warnings.filter(w => w.type === "outdated_validation" && w.severity === "high");
			assert.equal(outdated.length, 1);
		});

		it("flags outdated validation (medium severity 6-12 months)", () => {
			const old = new Date();
			old.setMonth(old.getMonth() - 8);
			const g = buildGraph([
				{ id: "a.md", strategic: { last_validated: old.toISOString().split('T')[0], evolution_stage: "custom" } },
			], []);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md"]);
			const outdated = result.warnings.filter(w => w.type === "outdated_validation" && w.severity === "medium");
			assert.equal(outdated.length, 1);
		});

		it("flags missing validation date", () => {
			const g = buildGraph([
				{ id: "a.md", strategic: { evolution_stage: "custom" } },
			], []);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md"]);
			const noDate = result.warnings.filter(w =>
				w.type === "outdated_validation" && w.message.includes("no validation date")
			);
			assert.equal(noDate.length, 1);
		});

		it("flags evolution inconsistency", () => {
			const g = buildGraph([
				{ id: "a.md", strategic: { type: "user_need", evolution_stage: "commodity" } },
			], []);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md"]);
			const inconsistency = result.warnings.filter(w => w.type === "evolution_inconsistency");
			assert.equal(inconsistency.length, 1);
		});

		it("does not flag consistent evolution", () => {
			const g = buildGraph([
				{ id: "a.md", strategic: { type: "user_need", evolution_stage: "genesis" } },
			], []);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md"]);
			const inconsistency = result.warnings.filter(w => w.type === "evolution_inconsistency");
			assert.equal(inconsistency.length, 0);
		});

		it("sorts warnings by severity (high first)", () => {
			const old = new Date();
			old.setMonth(old.getMonth() - 14);
			const g = buildGraph([
				{ id: "a.md", strategic: { confidence_level: "low", evolution_stage: "custom" } },
				{ id: "b.md", strategic: { last_validated: old.toISOString().split('T')[0], evolution_stage: "custom" } },
			], []);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md", "b.md"]);
			// First warning should be high severity
			const highIdx = result.warnings.findIndex(w => w.severity === "high");
			const medIdx = result.warnings.findIndex(w => w.severity === "medium");
			if (highIdx >= 0 && medIdx >= 0) {
				assert.ok(highIdx < medIdx);
			}
		});
	});

	describe("Strategic Insights", () => {
		it("detects orphaned components", () => {
			const g = buildGraph([
				{ id: "a.md", strategic: { evolution_stage: "custom" } },
				{ id: "b.md", strategic: { evolution_stage: "product" } },
				{ id: "orphan.md", strategic: { evolution_stage: "commodity" } },
			], [
				{ source: "a.md", target: "b.md", field: "depends_on" },
			]);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md", "b.md", "orphan.md"]);
			const orphaned = result.insights.filter(i => i.type === "orphaned_component");
			assert.equal(orphaned.length, 1);
			assert.ok(orphaned[0].affected_components.includes("orphan.md"));
		});

		it("detects critical path by importance", () => {
			const g = buildGraph([
				{ id: "a.md", strategic: { strategic_importance: "critical", evolution_stage: "custom" } },
			], []);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md"]);
			const critical = result.insights.filter(i => i.type === "critical_path");
			assert.equal(critical.length, 1);
			assert.ok(critical[0].affected_components.includes("a.md"));
		});

		it("detects critical path by dependency count >= 3", () => {
			const g = buildGraph([
				{ id: "hub.md", strategic: { evolution_stage: "product" } },
				{ id: "a.md", strategic: { evolution_stage: "custom" } },
				{ id: "b.md", strategic: { evolution_stage: "custom" } },
				{ id: "c.md", strategic: { evolution_stage: "custom" } },
			], [
				{ source: "a.md", target: "hub.md", field: "depends_on" },
				{ source: "b.md", target: "hub.md", field: "depends_on" },
				{ source: "c.md", target: "hub.md", field: "depends_on" },
			]);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["hub.md", "a.md", "b.md", "c.md"]);
			const critical = result.insights.filter(i => i.type === "critical_path");
			assert.equal(critical.length, 1);
			assert.ok(critical[0].affected_components.includes("hub.md"));
		});

		it("detects evolution gaps (more-evolved depends on less-evolved with gap > 1)", () => {
			// commodity depends_on genesis: gap of 3, should flag
			const g = buildGraph([
				{ id: "commodity.md", strategic: { evolution_stage: "commodity" } },
				{ id: "genesis.md", strategic: { evolution_stage: "genesis" } },
			], [
				{ source: "commodity.md", target: "genesis.md", field: "depends_on" },
			]);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["commodity.md", "genesis.md"]);
			const gaps = result.insights.filter(i => i.type === "evolution_gap");
			assert.equal(gaps.length, 1);
			assert.ok(gaps[0].affected_components.includes("commodity.md"));
		});

		it("does NOT flag normal dependency direction (genesis depends_on commodity)", () => {
			// genesis depends_on commodity: normal (less-evolved depends on more-evolved), should NOT flag
			const g = buildGraph([
				{ id: "genesis.md", strategic: { evolution_stage: "genesis" } },
				{ id: "commodity.md", strategic: { evolution_stage: "commodity" } },
			], [
				{ source: "genesis.md", target: "commodity.md", field: "depends_on" },
			]);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["genesis.md", "commodity.md"]);
			const gaps = result.insights.filter(i => i.type === "evolution_gap");
			assert.equal(gaps.length, 0);
		});

		it("does NOT flag small evolution gaps (1 stage)", () => {
			const g = buildGraph([
				{ id: "product.md", strategic: { evolution_stage: "product" } },
				{ id: "custom.md", strategic: { evolution_stage: "custom" } },
			], [
				{ source: "product.md", target: "custom.md", field: "depends_on" },
			]);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["product.md", "custom.md"]);
			const gaps = result.insights.filter(i => i.type === "evolution_gap");
			assert.equal(gaps.length, 0);
		});

		it("detects dependency risks (low confidence dependency)", () => {
			const g = buildGraph([
				{ id: "a.md", strategic: { evolution_stage: "custom" } },
				{ id: "risky.md", strategic: { confidence_level: "low", evolution_stage: "product" } },
			], [
				{ source: "a.md", target: "risky.md", field: "depends_on" },
			]);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md", "risky.md"]);
			const risks = result.insights.filter(i => i.type === "dependency_risk");
			assert.equal(risks.length, 1);
			assert.ok(risks[0].affected_components.includes("a.md"));
		});

		it("detects dependency risks (outdated dependency)", () => {
			const old = new Date();
			old.setMonth(old.getMonth() - 14);
			const g = buildGraph([
				{ id: "a.md", strategic: { evolution_stage: "custom" } },
				{ id: "old.md", strategic: { last_validated: old.toISOString().split('T')[0], evolution_stage: "product" } },
			], [
				{ source: "a.md", target: "old.md", field: "depends_on" },
			]);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md", "old.md"]);
			const risks = result.insights.filter(i => i.type === "dependency_risk");
			assert.equal(risks.length, 1);
		});
	});

	describe("Summary", () => {
		it("counts components by evolution stage", () => {
			const g = buildGraph([
				{ id: "a.md", strategic: { evolution_stage: "genesis" } },
				{ id: "b.md", strategic: { evolution_stage: "genesis" } },
				{ id: "c.md", strategic: { evolution_stage: "commodity" } },
			], []);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md", "b.md", "c.md"]);
			assert.equal(result.summary.total_components, 3);
			assert.equal(result.summary.by_evolution["genesis"], 2);
			assert.equal(result.summary.by_evolution["commodity"], 1);
		});

		it("counts by importance and confidence", () => {
			const g = buildGraph([
				{ id: "a.md", strategic: { strategic_importance: "critical", confidence_level: "high" } },
				{ id: "b.md", strategic: { strategic_importance: "supporting", confidence_level: "low" } },
			], []);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md", "b.md"]);
			assert.equal(result.summary.by_importance["critical"], 1);
			assert.equal(result.summary.by_importance["supporting"], 1);
			assert.equal(result.summary.by_confidence["high"], 1);
			assert.equal(result.summary.by_confidence["low"], 1);
		});

		it("uses 'unknown' for missing fields", () => {
			const g = buildGraph([
				{ id: "a.md", strategic: {} },
			], []);
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["a.md"]);
			assert.equal(result.summary.by_evolution["unknown"], 1);
		});
	});

	describe("Edge cases", () => {
		it("empty component list returns empty results", () => {
			const g = new StrategicGraph();
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze([]);
			assert.equal(result.warnings.length, 0);
			assert.equal(result.insights.length, 0);
			assert.equal(result.summary.total_components, 0);
		});

		it("skips nodes without strategic metadata", () => {
			const g = new StrategicGraph();
			g.addNode("plain.md", { id: "plain.md", resolved: true });
			const analyzer = new StrategicAnalyzer(g);
			const result = analyzer.analyze(["plain.md"]);
			assert.equal(result.summary.total_components, 0);
		});
	});
});
