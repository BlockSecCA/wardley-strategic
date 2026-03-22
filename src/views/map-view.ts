import { ItemView, WorkspaceLeaf } from "obsidian";
import type { StrategicGraph } from "../graph";
import type { MapContextManager } from "../map-context";
import type { MapContext, WardleyMapVisualSettings } from "../types";
import { WardleyMapRenderer } from "../renderer";
import { IntelligencePanel } from "./intelligence-panel";

export const VIEW_TYPE_WARDLEY = "wardley-strategic-map";

export class WardleyMapView extends ItemView {
	private graph: StrategicGraph;
	private contextManager: MapContextManager;
	private settings: WardleyMapVisualSettings;

	private renderer: WardleyMapRenderer | null = null;
	private intelligencePanel: IntelligencePanel | null = null;
	private currentContext: MapContext | null = null;
	private showIntelligence = false;

	// DOM refs
	private selectEl: HTMLSelectElement | null = null;
	private canvasEl: HTMLElement | null = null;
	private panelEl: HTMLElement | null = null;
	private contentEl_: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		graph: StrategicGraph,
		contextManager: MapContextManager,
		settings: WardleyMapVisualSettings,
	) {
		super(leaf);
		this.graph = graph;
		this.contextManager = contextManager;
		this.settings = settings;
	}

	getViewType(): string {
		return VIEW_TYPE_WARDLEY;
	}

	getDisplayText(): string {
		return "Wardley Map";
	}

	getIcon(): string {
		return "map";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('wardley-map-container');

		// Toolbar
		const toolbar = container.createDiv({ cls: 'wardley-map-controls' });

		const selectorDiv = toolbar.createDiv({ cls: 'map-selector' });
		selectorDiv.createEl('label', { text: 'Strategic Map:' });
		this.selectEl = selectorDiv.createEl('select');
		this.selectEl.addEventListener('change', () => this.onContextChange());

		const actionsDiv = toolbar.createDiv({ cls: 'map-actions' });

		const intelligenceBtn = actionsDiv.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': 'Toggle strategic intelligence panel' },
		});
		intelligenceBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11H1a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1Z"/><path d="M22 6a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6Z"/></svg>';
		intelligenceBtn.addEventListener('click', () => this.toggleIntelligence(intelligenceBtn));

		const refreshBtn = actionsDiv.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': 'Refresh map' },
		});
		refreshBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>';
		refreshBtn.addEventListener('click', () => this.refreshMap());

		// Map info (rendered dynamically)
		const mapInfo = container.createDiv({ cls: 'map-info' });
		mapInfo.style.display = 'none';

		// Content area
		this.contentEl_ = container.createDiv({ cls: 'wardley-content' });
		this.canvasEl = this.contentEl_.createDiv({ cls: 'wardley-map-canvas' });
		this.panelEl = this.contentEl_.createDiv({ cls: 'intelligence-panel' });
		this.panelEl.style.display = 'none';

		// Create renderer
		this.renderer = new WardleyMapRenderer(
			this.canvasEl, this.graph, this.contextManager, this.settings,
			(path) => this.app.workspace.openLinkText(path, '', false),
		);

		// Create intelligence panel
		this.intelligencePanel = new IntelligencePanel(
			this.panelEl, this.app, this.graph, this.contextManager,
		);

		// Initial render
		await this.refreshContexts();
		if (this.currentContext) {
			this.renderer.render(this.currentContext.id);
			this.updateMapInfo(container.querySelector('.map-info') as HTMLElement);
		}

		// Listen for graph updates
		this.registerEvent(
			// @ts-ignore: custom event
			this.app.workspace.on('wardley-strategic:graph-updated', () => {
				setTimeout(() => this.refreshMap(), 100);
			})
		);
	}

	async onClose(): Promise<void> {
		// Cleanup handled by Obsidian's event deregistration
	}

	private async refreshContexts(): Promise<void> {
		const contexts = await this.contextManager.detectMapContexts();
		this.currentContext = this.contextManager.getCurrentMapContext()
			|| this.contextManager.getDefaultMapContext();

		if (this.selectEl) {
			this.selectEl.empty();
			for (const ctx of contexts) {
				const option = this.selectEl.createEl('option', {
					text: ctx.name,
					value: ctx.id,
				});
				if (ctx.id === this.currentContext?.id) {
					option.selected = true;
				}
			}
		}
	}

	private onContextChange(): void {
		if (!this.selectEl) return;
		const selectedId = this.selectEl.value;
		const contexts = this.contextManager['cachedContexts'] as MapContext[];
		const selected = contexts.find(ctx => ctx.id === selectedId);

		if (selected) {
			this.currentContext = selected;
			this.contextManager.setCurrentMapContext(selected);
			if (this.renderer) this.renderer.render(selected.id);
			if (this.showIntelligence && this.intelligencePanel) {
				this.intelligencePanel.refresh();
			}
			const mapInfo = this.containerEl.querySelector('.map-info') as HTMLElement;
			if (mapInfo) this.updateMapInfo(mapInfo);
		}
	}

	private async refreshMap(): Promise<void> {
		await this.refreshContexts();
		if (this.renderer && this.currentContext) {
			this.renderer.render(this.currentContext.id);
		}
		if (this.showIntelligence && this.intelligencePanel) {
			await this.intelligencePanel.refresh();
		}
		const mapInfo = this.containerEl.querySelector('.map-info') as HTMLElement;
		if (mapInfo) this.updateMapInfo(mapInfo);
	}

	private toggleIntelligence(btn: HTMLElement): void {
		this.showIntelligence = !this.showIntelligence;

		if (this.panelEl) {
			this.panelEl.style.display = this.showIntelligence ? '' : 'none';
		}
		if (this.contentEl_) {
			this.contentEl_.toggleClass('split-view', this.showIntelligence);
		}
		btn.toggleClass('active', this.showIntelligence);

		if (this.showIntelligence && this.intelligencePanel) {
			this.intelligencePanel.refresh();
		}
	}

	private updateMapInfo(mapInfo: HTMLElement): void {
		mapInfo.empty();
		if (!this.currentContext) {
			mapInfo.style.display = 'none';
			return;
		}

		mapInfo.style.display = '';
		mapInfo.createEl('h3', { text: this.currentContext.name });
		if (this.currentContext.description) {
			mapInfo.createEl('p', { cls: 'map-description', text: this.currentContext.description });
		}
		const badge = mapInfo.createEl('span', {
			cls: `map-scope-badge scope-${this.currentContext.scope}`,
			text: this.currentContext.scope,
		});
	}
}
