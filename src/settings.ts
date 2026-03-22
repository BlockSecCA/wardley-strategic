import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { WardleyMapVisualSettings } from "./types";
import { DEFAULT_VISUAL_SETTINGS } from "./types";

export interface WardleyStrategicSettings {
	visual: WardleyMapVisualSettings;
}

export const DEFAULT_SETTINGS: WardleyStrategicSettings = {
	visual: { ...DEFAULT_VISUAL_SETTINGS },
};

export class WardleyStrategicSettingTab extends PluginSettingTab {
	private settings: WardleyStrategicSettings;
	private onSave: () => Promise<void>;

	constructor(app: App, plugin: Plugin, settings: WardleyStrategicSettings, onSave: () => Promise<void>) {
		super(app, plugin);
		this.settings = settings;
		this.onSave = onSave;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Wardley Strategic Mapping' });

		new Setting(containerEl)
			.setName('Font size')
			.setDesc('Font size for component labels')
			.addSlider(slider => slider
				.setLimits(8, 16, 1)
				.setValue(this.settings.visual.font_size)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.settings.visual.font_size = value;
					await this.onSave();
				}));

		new Setting(containerEl)
			.setName('Node size')
			.setDesc('Radius of component circles')
			.addSlider(slider => slider
				.setLimits(6, 20, 1)
				.setValue(this.settings.visual.node_size)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.settings.visual.node_size = value;
					await this.onSave();
				}));

		new Setting(containerEl)
			.setName('Edge thickness')
			.setDesc('Width of relationship lines')
			.addSlider(slider => slider
				.setLimits(1, 5, 0.5)
				.setValue(this.settings.visual.edge_thickness)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.settings.visual.edge_thickness = value;
					await this.onSave();
				}));

		new Setting(containerEl)
			.setName('Component spacing')
			.setDesc('Spacing between overlapping components')
			.addSlider(slider => slider
				.setLimits(40, 120, 10)
				.setValue(this.settings.visual.component_spacing)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.settings.visual.component_spacing = value;
					await this.onSave();
				}));

		new Setting(containerEl)
			.setName('Show evolution grid')
			.setDesc('Display vertical grid lines for evolution stages')
			.addToggle(toggle => toggle
				.setValue(this.settings.visual.show_evolution_grid)
				.onChange(async (value) => {
					this.settings.visual.show_evolution_grid = value;
					await this.onSave();
				}));

		new Setting(containerEl)
			.setName('Show axis labels')
			.setDesc('Display axis labels for Value Chain and Evolution')
			.addToggle(toggle => toggle
				.setValue(this.settings.visual.show_axis_labels)
				.onChange(async (value) => {
					this.settings.visual.show_axis_labels = value;
					await this.onSave();
				}));
	}
}
