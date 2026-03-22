# wardley-strategic

> PUBLIC REPO. No secrets, no PII, no internal references.

Obsidian plugin that builds interactive Wardley Maps from strategic YAML frontmatter across vault notes. v1.0.0.

## Architecture

```
Vault notes (frontmatter) -> Scanner -> Graph -> Positioner -> Renderer -> SVG
                                          |
                                    Analyzer -> Intelligence Panel
```

**Entry point**: `src/main.ts` registers the Wardley map ItemView, commands, settings tab, and metadata change listeners.

**Build**: `npm run build` (tsc + esbuild) -> `main.js`. Deploy alongside `manifest.json` and `styles.css`.

**Tests**: `npm test` runs `test.mts` via Node's built-in test runner. 48 tests covering graph, positioner, analyzer, and types.

## Key Design Decision

This plugin reads YAML frontmatter from vault notes, not inline code blocks. Each note is a component; relationships (`depends_on`, `enables`, etc.) are wikilinks in frontmatter. This differs from `wardley-map-simple` which renders self-contained maps from code blocks.

## Source Files

- `src/types.ts` -- All interfaces, constants, and default settings
- `src/graph.ts` -- `StrategicGraph`: simple adjacency-list graph (replaces graphology)
- `src/scanner.ts` -- `VaultScanner`: reads Obsidian metadataCache, builds graph
- `src/map-context.ts` -- `MapContextManager`: detects vault/folder/membership map scopes
- `src/positioner.ts` -- `WardleyPositioner`: layout algorithm (longest-path BFS)
- `src/analyzer.ts` -- `StrategicAnalyzer`: generates validation warnings and strategic insights
- `src/renderer.ts` -- `WardleyMapRenderer`: SVG rendering with click-to-open navigation
- `src/views/map-view.ts` -- `WardleyMapView`: Obsidian ItemView with toolbar, canvas, intelligence panel
- `src/views/intelligence-panel.ts` -- `IntelligencePanel`: analysis display (warnings, insights, distributions)
- `src/settings.ts` -- Settings tab for visual customization
- `src/main.ts` -- Plugin entry, wiring, event listeners

## Layout Algorithm

`longestPathFromRoot()` in positioner.ts:
- Roots: user_need types + nodes with no incoming dependencies
- BFS from roots, depth = longest path from any root
- X-axis from evolution stage band (genesis=12.5%, custom=37.5%, product=62.5%, commodity=87.5%)
- Evolution pairs (evolves_to/evolved_from) share Y coordinate
- Spreading: components at same (Y, stage) sorted by average neighbor X to reduce crossings

## Frontmatter Format

```yaml
wardley: true        # Required discriminator
type: component | user_need | capability | product | service
evolution_stage: genesis | custom | product | commodity
strategic_importance: critical | important | supporting | optional
confidence_level: high | medium | low
evidence_sources:
  - "[[Note Name]]"
last_validated: "2025-01-15"
strategic_maps: ["map-id"]

# Relationships (wikilinks)
depends_on:
  - "[[Component A]]"
enables:
  - "[[Component B]]"
evolves_to:
  - "[[Next Version]]"
evolved_from:
  - "[[Previous Version]]"
constrains:
  - "[[Constrained Component]]"
```

## Map Contexts

Three scoping patterns:
1. **Vault**: all strategic notes (default when no folder contexts exist)
2. **Folder**: detected by `Map-Context.md` file in a folder
3. **Membership**: notes declare `strategic_maps: ["map-id"]` in frontmatter

## Testing

```bash
npm test    # 48 tests (graph, positioner, analyzer, types)
```

## Repo Structure

```
src/              Source (TypeScript)
src/views/        ItemView and panel implementations
examples/         Tea Shop example vault
test.mts          Test suite
main.js           Built plugin artifact (committed)
manifest.json     Obsidian plugin manifest
styles.css        Plugin styles with Obsidian CSS variables
```
