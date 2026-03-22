import { type App, Notice } from "obsidian";
import type { StrategicGraph } from "../graph";
import type { MapContextManager } from "../map-context";
import type { WardleyMapVisualSettings, StrategicValidationWarning, StrategicInsight, AnalysisResult, ScanWarning } from "../types";
import { StrategicAnalyzer } from "../analyzer";
import { generateReport } from "../report";

/**
 * Renders the Strategic Intelligence analysis panel as DOM elements.
 * Sections are collapsible. Insights shown before warnings.
 */
export class IntelligencePanel {
	private container: HTMLElement;
	private app: App;
	private graph: StrategicGraph;
	private contextManager: MapContextManager;
	private settings: WardleyMapVisualSettings;
	private loading = false;

	constructor(container: HTMLElement, app: App, graph: StrategicGraph, contextManager: MapContextManager, settings: WardleyMapVisualSettings) {
		this.container = container;
		this.app = app;
		this.graph = graph;
		this.contextManager = contextManager;
		this.settings = settings;
	}

	async refresh(scanWarnings?: ScanWarning[]): Promise<void> {
		this.loading = true;
		this.container.empty();

		const context = this.contextManager.getCurrentMapContext()
			|| this.contextManager.getDefaultMapContext();

		if (!context) {
			this.renderEmptyState();
			return;
		}

		const checkNoteExists = (name: string): boolean => {
			const allFiles = this.app.vault.getMarkdownFiles();
			return allFiles.some(f => f.basename === name);
		};

		const analyzer = new StrategicAnalyzer(this.graph, checkNoteExists);
		const componentIds = this.contextManager.getComponentsForMap(context.id);
		const result = analyzer.analyze(componentIds);

		this.renderPanel(context.name, context.scope, result, scanWarnings ?? []);
		this.loading = false;
	}

	private renderPanel(contextName: string, scope: string, result: AnalysisResult, scanWarnings: ScanWarning[]): void {
		const panel = this.container.createDiv({ cls: 'strategic-intelligence-panel' });

		// Header
		const header = panel.createDiv({ cls: 'panel-header' });
		header.createEl('h3', { text: 'Strategic Intelligence' });
		const btnGroup = header.createDiv({ cls: 'panel-btn-group' });

		const saveBtn = btnGroup.createEl('button', { cls: 'refresh-btn', text: 'Save Report' });
		saveBtn.addEventListener('click', () => this.saveReport());

		const refreshBtn = btnGroup.createEl('button', { cls: 'refresh-btn', text: 'Refresh' });
		refreshBtn.addEventListener('click', () => this.refresh(scanWarnings));

		// Context info
		const contextInfo = panel.createDiv({ cls: 'context-info' });
		contextInfo.createEl('h4', { text: contextName });
		contextInfo.createEl('span', { text: scope, cls: 'context-scope' });

		// Summary cards
		const cards = panel.createDiv({ cls: 'summary-cards' });
		this.renderCard(cards, 'Components', result.summary.total_components.toString());
		this.renderCard(cards, 'Warnings', result.warnings.length.toString(), 'critical');
		this.renderCard(cards, 'Insights', result.insights.length.toString(), 'info');

		// Evolution distribution
		if (Object.keys(result.summary.by_evolution).length > 0) {
			this.renderDistribution(panel, result.summary.by_evolution, result.summary.total_components);
		}

		// Scan warnings (malformed notes) -- collapsible, before analysis
		if (scanWarnings.length > 0) {
			this.renderCollapsible(panel, `Malformed Notes (${scanWarnings.length})`, false, (content) => {
				this.renderScanWarningItems(content, scanWarnings);
			});
		}

		// Insights first -- collapsible, open by default
		if (result.insights.length > 0) {
			this.renderCollapsible(panel, `Strategic Insights (${result.insights.length})`, true, (content) => {
				this.renderInsightItems(content, result.insights);
			});
		}

		// Warnings -- collapsible, closed by default
		if (result.warnings.length > 0) {
			this.renderCollapsible(panel, `Validation Warnings (${result.warnings.length})`, false, (content) => {
				this.renderWarningItems(content, result.warnings);
			});
		}
	}

	private renderCollapsible(
		parent: HTMLElement,
		title: string,
		open: boolean,
		renderContent: (container: HTMLElement) => void,
	): void {
		const details = parent.createEl('details', { cls: 'collapsible-section' });
		if (open) details.setAttribute('open', '');
		details.createEl('summary', { cls: 'collapsible-header', text: title });
		const content = details.createDiv({ cls: 'collapsible-content' });
		renderContent(content);
	}

	private renderCard(parent: HTMLElement, title: string, value: string, cls?: string): void {
		const card = parent.createDiv({ cls: 'summary-card' });
		card.createDiv({ cls: 'card-title', text: title });
		const valEl = card.createDiv({ cls: 'card-value', text: value });
		if (cls) valEl.addClass(cls);
	}

	private renderDistribution(parent: HTMLElement, byEvolution: Record<string, number>, total: number): void {
		const section = parent.createDiv({ cls: 'distribution-section' });
		section.createEl('h5', { text: 'Evolution Distribution' });

		const bars = section.createDiv({ cls: 'distribution-bars' });
		for (const [stage, count] of Object.entries(byEvolution)) {
			const item = bars.createDiv({ cls: 'distribution-item' });
			item.createEl('span', { cls: 'stage-name', text: stage });

			const barContainer = item.createDiv({ cls: 'bar-container' });
			const bar = barContainer.createDiv({ cls: `bar evolution-${stage}` });
			bar.style.width = `${(count / total) * 100}%`;

			item.createEl('span', { cls: 'count', text: count.toString() });
		}
	}

	private renderWarningItems(parent: HTMLElement, warnings: StrategicValidationWarning[]): void {
		for (const warning of warnings) {
			const item = parent.createDiv({ cls: `warning-item severity-${warning.severity}` });

			const itemHeader = item.createDiv({ cls: 'item-header' });
			itemHeader.createEl('span', { cls: 'severity-icon', text: this.getSeverityIcon(warning.severity) });
			itemHeader.createEl('span', { cls: 'item-type', text: this.getWarningLabel(warning.type) });

			item.createDiv({ cls: 'item-message', text: warning.message });

			const link = item.createEl('button', {
				cls: 'component-link',
				text: this.getDisplayName(warning.component_path),
			});
			link.addEventListener('click', () => this.openComponent(warning.component_path));
		}
	}

	private renderInsightItems(parent: HTMLElement, insights: StrategicInsight[]): void {
		for (const insight of insights) {
			const item = parent.createDiv({ cls: `insight-item priority-${insight.priority}` });

			const itemHeader = item.createDiv({ cls: 'item-header' });
			itemHeader.createEl('span', { cls: 'priority-icon', text: this.getPriorityIcon(insight.priority) });
			itemHeader.createEl('span', { cls: 'item-type', text: this.getInsightLabel(insight.type) });

			item.createDiv({ cls: 'item-message', text: insight.message });

			if (insight.affected_components.length > 0) {
				const affected = item.createDiv({ cls: 'affected-components' });
				const shown = insight.affected_components.slice(0, 3);
				for (const path of shown) {
					const link = affected.createEl('button', {
						cls: 'component-link',
						text: this.getDisplayName(path),
					});
					link.addEventListener('click', () => this.openComponent(path));
				}
				if (insight.affected_components.length > 3) {
					affected.createEl('span', {
						cls: 'more-components',
						text: `+${insight.affected_components.length - 3} more`,
					});
				}
			}
		}
	}

	private renderScanWarningItems(parent: HTMLElement, scanWarnings: ScanWarning[]): void {
		for (const warning of scanWarnings) {
			const item = parent.createDiv({ cls: 'warning-item severity-medium' });

			const itemHeader = item.createDiv({ cls: 'item-header' });
			itemHeader.createEl('span', { cls: 'severity-icon', text: '\u26A0\uFE0F' });

			const link = itemHeader.createEl('button', {
				cls: 'component-link',
				text: this.getDisplayName(warning.path),
			});
			link.addEventListener('click', () => this.openComponent(warning.path));

			for (const problem of warning.problems) {
				item.createDiv({ cls: 'item-message', text: problem });
			}
		}
	}

	private async saveReport(): Promise<void> {
		const checkNoteExists = (name: string): boolean => {
			const allFiles = this.app.vault.getMarkdownFiles();
			return allFiles.some(f => f.basename === name);
		};

		const result = generateReport(this.graph, this.contextManager, this.settings, checkNoteExists);
		if (!result) {
			new Notice('No map context found');
			return;
		}

		const existing = this.app.vault.getAbstractFileByPath(result.filename);
		if (existing) {
			await this.app.vault.modify(existing as any, result.content);
			new Notice(`Updated ${result.filename}`);
		} else {
			await this.app.vault.create(result.filename, result.content);
			new Notice(`Created ${result.filename}`);
		}
	}

	private renderEmptyState(): void {
		const empty = this.container.createDiv({ cls: 'empty-state' });
		empty.createEl('p', { text: 'No strategic map context available.' });
		empty.createEl('p', { text: 'Add strategic metadata to your notes to enable analysis.' });
	}

	private openComponent(path: string): void {
		this.app.workspace.openLinkText(path, '', false);
	}

	private getDisplayName(path: string): string {
		return path.split('/').pop()?.replace('.md', '') || path;
	}

	private getSeverityIcon(severity: string): string {
		const icons: Record<string, string> = { high: '\u{1F534}', medium: '\u{1F7E1}', low: '\u{1F7E2}' };
		return icons[severity] || '\u26AA';
	}

	private getPriorityIcon(priority: string): string {
		const icons: Record<string, string> = { high: '\u26A1', medium: '\u{1F4CB}', low: '\u{1F4A1}' };
		return icons[priority] || '\u{1F4CC}';
	}

	private getWarningLabel(type: string): string {
		const labels: Record<string, string> = {
			low_confidence: 'Low Confidence',
			missing_evidence: 'Missing Evidence',
			outdated_validation: 'Outdated Validation',
			evolution_inconsistency: 'Evolution Inconsistency',
		};
		return labels[type] || type.replace(/_/g, ' ');
	}

	private getInsightLabel(type: string): string {
		const labels: Record<string, string> = {
			orphaned_component: 'Orphaned Components',
			critical_path: 'Critical Path',
			evolution_gap: 'Evolution Gap',
			dependency_risk: 'Dependency Risk',
		};
		return labels[type] || type.replace(/_/g, ' ');
	}
}
