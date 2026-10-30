import { test, expect } from './fixtures';
import type * as Three from 'three';
import type * as Core from '../../src/core';
import type * as RendererModule from '../../src/render/TileRenderer';
import type * as Models from '../../src/render/voxels';
import type * as ExportModule from '../../src/render/modelExport';

test('reuses terrain and indexed model templates, invalidates edited assets, and keeps exports independent', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const coreUrl = '/src/core/index.ts';
    const rendererUrl = '/src/render/TileRenderer.ts';
    const modelsUrl = '/src/render/voxels.ts';
    const exportUrl = '/src/render/modelExport.ts';
    const { defaultConfig, generateTile }: typeof Core = await import(/* @vite-ignore */ coreUrl);
    const { TileRenderer }: typeof RendererModule = await import(/* @vite-ignore */ rendererUrl);
    const { ASSET_LIBRARY }: typeof Models = await import(/* @vite-ignore */ modelsUrl);
    const { disposeExportContent }: typeof ExportModule = await import(
      /* @vite-ignore */ exportUrl
    );
    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'fixed',
      width: '512px',
      height: '512px',
      left: '-1000px',
    });
    document.body.append(container);
    const renderer = new TileRenderer(container);
    const config = structuredClone(defaultConfig);
    config.grid.showGrid = false;
    const tile = generateTile(config);
    const draw = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    try {
      renderer.update(tile, config);
      await draw();
      const first = renderer.getDiagnostics();
      const snapshot = renderer.snapshotForExport();
      const before = Array.from(
        (snapshot.children[0] as Three.Mesh).geometry.getAttribute('position').array,
      );
      const indexed = snapshot.children.filter(
        (object) =>
          (object as Three.InstancedMesh).isInstancedMesh && (object as Three.Mesh).geometry.index,
      );
      const compact = indexed.every((object) => {
        const geometry = (object as Three.Mesh).geometry;
        return geometry.getAttribute('position').count * 1.5 === geometry.index!.count;
      });
      config.grid.showGrid = true;
      renderer.update(tile, config);
      await draw();
      const grid = renderer.getDiagnostics();
      const rolled = structuredClone(tile);
      rolled.fields[0]!.action = rolled.fields[0]!.action === 'shop' ? 'event' : 'shop';
      renderer.update(rolled, config);
      await draw();
      const action = renderer.getDiagnostics();
      config.terrain.grain = 0.14;
      renderer.update(rolled, config);
      await draw();
      const material = renderer.getDiagnostics();
      const kind = tile.decorations[0]!.kind;
      const model = structuredClone(ASSET_LIBRARY.find((asset) => asset.id === kind)!);
      model.id = 'render-cache-model';
      renderer.registerModel(model);
      config.decoration.modelSlots = { ...config.decoration.modelSlots, [kind]: model.id };
      renderer.update(rolled, config);
      await draw();
      const custom = renderer.getDiagnostics();
      const changed = structuredClone(model);
      changed.palette[0] = '#ff0055';
      renderer.registerModel(changed);
      renderer.update(rolled, config);
      await draw();
      const edited = renderer.getDiagnostics();
      const frozen = before.every(
        (value, index) =>
          value ===
          (snapshot.children[0] as Three.Mesh).geometry.getAttribute('position').array[index],
      );
      const style = snapshot.userData.renderStyleVersion as number;
      const geometry = structuredClone(rolled);
      const cell = geometry.cells.find((cell) => cell.surfacePolygons.length && !cell.fieldId)!;
      cell.height += 0.03;
      renderer.update(geometry, config);
      await draw();
      const moved = renderer.getDiagnostics();
      disposeExportContent(snapshot);
      return {
        first,
        grid,
        action,
        material,
        custom,
        edited,
        moved,
        compact,
        indexed: indexed.length,
        frozen,
        style,
      };
    } finally {
      renderer.dispose();
      container.remove();
    }
  });
  expect(result.first.drawCalls).toBeGreaterThan(0);
  expect(result.first.drawCalls).toBeLessThan(40);
  expect(result.indexed).toBeGreaterThan(0);
  expect(result.compact).toBe(true);
  expect(result.grid.surfaceRevision).toBe(result.first.surfaceRevision);
  expect(result.action.surfaceRevision).toBe(result.first.surfaceRevision);
  expect(result.material.surfaceRevision).toBe(result.first.surfaceRevision);
  expect(result.grid.modelGeometryBuilds).toBe(result.first.modelGeometryBuilds);
  expect(result.action.modelGeometryBuilds).toBe(result.first.modelGeometryBuilds);
  expect(result.custom.modelGeometryBuilds).toBe(result.first.modelGeometryBuilds + 1);
  expect(result.edited.modelGeometryBuilds).toBe(result.custom.modelGeometryBuilds + 1);
  expect(result.edited.surfaceRevision).toBe(result.first.surfaceRevision);
  expect(result.moved.surfaceRevision).toBe(result.first.surfaceRevision + 1);
  expect(result.frozen).toBe(true);
  expect(result.style).toBe(2);
  expect(errors).toEqual([]);
});
