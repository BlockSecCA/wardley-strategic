import { Plugin } from "obsidian";
import { StrategicGraph } from "./graph";
import { VaultScanner } from "./scanner";
import { MapContextManager } from "./map-context";
import { WardleyMapView, VIEW_TYPE_WARDLEY } from "./views/map-view";
import { WardleyStrategicSettingTab, DEFAULT_SETTINGS } from "./settings";
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

		// Command to refresh the graph
		this.addCommand({
			id: 'refresh-wardley-graph',
			name: 'Refresh strategic graph',
			callback: () => this.refresh(),
		});

		// Settings tab
		this.addSettingTab(
			new WardleyStrategicSettingTab(this.app, this.settings, async () => {
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
