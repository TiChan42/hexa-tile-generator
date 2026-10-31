import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { topViewSvg } from '../src/render/svgExport';

function plane(color: string, size = 2) {
  const geometry = new THREE.PlaneGeometry(size, size);
  geometry.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
}

it('exports actual top-facing geometry as scalable paths with explicit dimensions and transparency', () => {
  const content = new THREE.Group();
  content.add(plane('#aa3322'));
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: '#112233', side: THREE.DoubleSide }),
  );
  content.add(wall);
  const hidden = plane('#abcdef');
  hidden.visible = false;
  content.add(hidden);
  const svg = topViewSvg(content, 512, true);
  expect(svg).toContain('width="512" height="512"');
  expect(svg).toContain('viewBox="-1.04 -1.04 2.08 2.08"');
  expect(svg).toContain('fill="#aa3322"');
  expect(svg).not.toContain('#112233');
  expect(svg).not.toContain('#abcdef');
  expect(svg).not.toMatch(/<image|data:image|<script/);
  expect(topViewSvg(content, 1024, false)).toContain('fill="#eeede4"');
  expect(topViewSvg(content, 512, true)).toBe(svg);
  expect(() => topViewSvg(content, 64, true)).toThrow('128 und 4096');
  expect(() => topViewSvg(new THREE.Group(), 512, true)).toThrow('keine Geometrie');
});

it('includes transformed voxel instances and visible grid lines without disposing source resources', () => {
  const content = new THREE.Group();
  content.add(plane('#eeeeee', 4));
  const geometry = new THREE.BoxGeometry(0.5, 0.8, 0.5);
  const vertices = geometry.getAttribute('position');
  const colors = new Float32Array(vertices.count * 3);
  colors.fill(0.5);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true });
  const mesh = new THREE.InstancedMesh(geometry, material, 2);
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-1, 0.5, 0));
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1, 0.8, 0));
  content.add(mesh);
  const gridGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2, 0.01, 0),
    new THREE.Vector3(2, 0.01, 0),
  ]);
  const grid = new THREE.LineSegments(
    gridGeometry,
    new THREE.LineBasicMaterial({ color: '#304c42', transparent: true, opacity: 0.11 }),
  );
  content.add(grid);
  const dispose = vi.spyOn(geometry, 'dispose');
  const positions = Array.from(vertices.array),
    instances = Array.from(mesh.instanceMatrix.array);
  const svg = topViewSvg(content, 512, true);
  expect(svg).toContain('fill="#bcbcbc"');
  expect(svg).toContain('stroke="#304c42"');
  expect(svg).toContain('stroke-opacity="0.11"');
  expect(svg).toContain('L-0.75');
  expect(svg).toContain('L1.25');
  expect(dispose).not.toHaveBeenCalled();
  expect(Array.from(vertices.array)).toEqual(positions);
  expect(Array.from(mesh.instanceMatrix.array)).toEqual(instances);
  grid.visible = false;
  expect(topViewSvg(content, 512, true)).not.toContain('stroke="#304c42"');
});

it('reuses fully vector action symbols with quantity badges at their true positions', () => {
  const content = new THREE.Group();
  content.add(plane('#eeeeee'));
  const first = plane('#ffffff', 0.5);
  first.material.userData.actionIcon = { action: 'gold', amount: 3 };
  first.position.set(-0.5, 0.02, 0);
  const second = first.clone();
  second.position.x = 0.5;
  content.add(first, second);
  const svg = topViewSvg(content, 256, true);
  expect(svg.match(/<symbol /g)).toHaveLength(1);
  expect(svg.match(/<use /g)).toHaveLength(2);
  expect(svg).toContain('id="icon-gold-3"');
  expect(svg).toContain('viewBox="0 0 72 72"');
  expect(svg).toContain('x="-0.75" y="-0.25" width="0.5" height="0.5"');
  expect(svg).not.toMatch(/<image|base64/);
  first.material.userData.actionIcon.amount = 2;
  expect(topViewSvg(content, 256, true)).not.toBe(svg);
});
