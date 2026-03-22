import { Plugin, Notice } from "obsidian";
import { StrategicGraph } from "./graph";
import { VaultScanner } from "./scanner";
import { MapContextManager } from "./map-context";
import { WardleyMapView, VIEW_TYPE_WARDLEY } from "./views/map-view";
import { WardleyStrategicSettingTab, DEFAULT_SETTINGS } from "./settings";
import { exportToOWM, exportToSVG } from "./export";
import type { WardleyStrategicSettings } from "./settings";
import type { ScanWarning } from "./types";

export default class WardleyStrategicPlugin extends Plugin {
	graph: StrategicGraph = new StrategicGraph();
	scanWarnings: ScanWarning[] = [];
	scanner!: VaultScanner;
	contextManager!: MapContextManager;
	settings!: WardleyStrategicSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.scanner = new VaultScanner(this.app);
		this.contextManager = new MapContextManager(this.app, this.graph);

		// Register the Wardley map view
		this.registerView(VIEW_TYPE_WARDLEY, (leaf) =>
			new WardleyMapView(leaf, this)
		);

		// Command to open the map view
		this.addCommand({
			id: 'open-wardley-map',
			name: 'Open Wardley Strategic Map',
			callback: () => this.activateView(),
		});

		// Export as OWM text (clipboard)
		this.addCommand({
			id: 'export-owm',
			name: 'Export map as OWM (clipboard)',
			callback: () => {
				const owm = exportToOWM(this.graph, this.contextManager, this.settings.visual);
				if (owm) {
					navigator.clipboard.writeText(owm);
					new Notice('OWM map copied to clipboard');
				} else {
					new Notice('No map context found');
				}
			},
		});

		// Export as SVG file
		this.addCommand({
			id: 'export-svg',
			name: 'Export map as SVG',
			callback: async () => {
				const svg = exportToSVG(this.graph, this.contextManager, this.settings.visual);
				if (svg) {
					const context = this.contextManager.getCurrentMapContext()
						|| this.contextManager.getDefaultMapContext();
					const filename = (context?.name || 'wardley-map')
						.replace(/[^a-zA-Z0-9-_ ]/g, '')
						.replace(/\s+/g, '-')
						.toLowerCase() + '.svg';
					await this.app.vault.create(filename, svg);
					new Notice(`Saved ${filename}`);
				} else {
					new Notice('No map context found');
				}
			},
		});

		// Settings tab
		this.addSettingTab(
			new WardleyStrategicSettingTab(this.app, this, this.settings, async () => {
				await this.saveData(this.settings);
			})
		);

		// Build graph after metadata cache is ready
		this.app.workspace.onLayoutReady(() => {
			this.refresh();

			// Rebuild on file changes
			this.registerEvent(
				this.app.metadataCache.on('changed', () => {
					this.refresh();
				})
			);
			this.registerEvent(
				this.app.vault.on('rename', () => {
					this.refresh();
				})
			);
			this.registerEvent(
				this.app.vault.on('delete', () => {
					this.refresh();
				})
			);
		});
	}

	onunload(): void {
		// View deregistration handled by Obsidian
	}

	refresh(): void {
		const { graph, warnings } = this.scanner.scanVault();
		this.graph = graph;
		this.scanWarnings = warnings;
		this.contextManager = new MapContextManager(this.app, this.graph);

		// Notify views
		// @ts-ignore: custom event
		this.app.workspace.trigger('wardley-strategic:graph-updated');
	}

	private async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_WARDLEY);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_WARDLEY, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	private async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
}
