import { TFile, App } from "obsidian";
import type { StrategicGraph } from "./graph";
import type { MapContext } from "./types";

/**
 * Detects and manages map contexts: vault-wide, folder-based, or membership-based scopes.
 */
export class MapContextManager {
	private app: App;
	private graph: StrategicGraph;
	private cachedContexts: MapContext[] = [];
	private currentContext: MapContext | null = null;

	constructor(app: App, graph: StrategicGraph) {
		this.app = app;
		this.graph = graph;
	}

	async detectMapContexts(): Promise<MapContext[]> {
		const contexts: MapContext[] = [];

		const vaultContext = this.detectVaultContext();
		if (vaultContext) contexts.push(vaultContext);

		const folderContexts = await this.detectFolderContexts();
		contexts.push(...folderContexts);

		const membershipContexts = this.detectMembershipContexts();
		contexts.push(...membershipContexts);

		this.cachedContexts = contexts;
		return contexts;
	}

	private detectVaultContext(): MapContext | null {
		const strategicFiles = this.getStrategicFiles();
		if (strategicFiles.length === 0) return null;

		// Only add vault context if no folder contexts exist
		const hasFolderContexts = strategicFiles.some(file => {
			if (!file.path.includes('/')) return false;
			const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
			return this.hasMapContextFile(folderPath);
		});

		if (!hasFolderContexts) {
			return {
				id: "vault",
				name: "Vault Strategic Map",
				scope: "vault",
				description: "Strategic map spanning entire vault",
			};
		}

		return null;
	}

	private async detectFolderContexts(): Promise<MapContext[]> {
		const contexts: MapContext[] = [];
		const allFiles = this.app.vault.getAllLoadedFiles();

		const folderPaths = new Set<string>();
		for (const file of allFiles) {
			if (file.path.includes('/') && this.app.vault.getAbstractFileByPath(file.path)) {
				const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
				folderPaths.add(folderPath);
			}
		}

		for (const folderPath of folderPaths) {
			const mapContextFile = this.app.vault.getAbstractFileByPath(
				`${folderPath}/Map-Context.md`
			);

			if (mapContextFile instanceof TFile) {
				const content = await this.app.vault.cachedRead(mapContextFile);
				const context = this.parseMapContextFile(content, folderPath);
				if (context) contexts.push(context);
			}
		}

		return contexts;
	}

	private detectMembershipContexts(): MapContext[] {
		const contexts: MapContext[] = [];
		const mapMemberships = new Map<string, string[]>();

		this.graph.forEachNode((nodeId, attrs) => {
			if (attrs.strategic?.strategic_maps) {
				for (const mapId of attrs.strategic.strategic_maps) {
					if (!mapMemberships.has(mapId)) mapMemberships.set(mapId, []);
					mapMemberships.get(mapId)!.push(nodeId);
				}
			}
		});

		for (const [mapId, members] of mapMemberships) {
			contexts.push({
				id: mapId,
				name: mapId.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
				scope: "membership",
				description: `Strategic map with ${members.length} declared members`,
				includes: members,
			});
		}

		return contexts;
	}

	private parseMapContextFile(content: string, folderPath: string): MapContext | null {
		const titleMatch = content.match(/^#\s+(.+)$/m);
		const title = titleMatch ? titleMatch[1] : folderPath.split('/').pop() || 'Untitled';

		// Extract first paragraph after the heading
		const lines = content.split('\n');
		const headingIdx = lines.findIndex(l => /^#\s+/.test(l));
		let description: string | undefined;
		if (headingIdx >= 0 && headingIdx + 2 < lines.length && lines[headingIdx + 1] === '') {
			const descLine = lines[headingIdx + 2];
			if (descLine && !descLine.startsWith('#')) {
				description = descLine.trim();
			}
		}

		return {
			id: folderPath,
			name: title,
			scope: "folder",
			description,
			includes: [folderPath],
		};
	}

	private getStrategicFiles(): TFile[] {
		const strategicFiles: TFile[] = [];

		this.graph.forEachNode((nodeId, attrs) => {
			if (attrs.strategic && attrs.resolved) {
				const file = this.app.vault.getAbstractFileByPath(nodeId);
				if (file instanceof TFile) strategicFiles.push(file);
			}
		});

		return strategicFiles;
	}

	private hasMapContextFile(folderPath: string): boolean {
		const file = this.app.vault.getAbstractFileByPath(`${folderPath}/Map-Context.md`);
		return file instanceof TFile;
	}

	getCurrentMapContext(): MapContext | null {
		return this.currentContext;
	}

	setCurrentMapContext(context: MapContext): void {
		this.currentContext = context;
	}

	getDefaultMapContext(): MapContext | null {
		if (this.cachedContexts.length === 0) return null;
		const vaultContext = this.cachedContexts.find(ctx => ctx.scope === "vault");
		if (vaultContext) return vaultContext;
		return this.cachedContexts[0];
	}

	getComponentsForMap(mapId: string): string[] {
		const context = this.cachedContexts.find(ctx => ctx.id === mapId);
		if (!context) return [];

		const components: string[] = [];

		this.graph.forEachNode((nodeId, attrs) => {
			if (!attrs.strategic) return;

			let includeInMap = false;

			switch (context.scope) {
				case "vault":
					includeInMap = attrs.resolved;
					break;
				case "folder":
					if (context.includes) {
						includeInMap = context.includes.some(folder =>
							nodeId.startsWith(folder + '/')
						);
					}
					break;
				case "membership":
					includeInMap = attrs.strategic.strategic_maps?.includes(mapId) || false;
					break;
			}

			if (includeInMap) components.push(nodeId);
		});

		return components;
	}

	refresh(): void {
		this.cachedContexts = [];
		this.currentContext = null;
	}
}
