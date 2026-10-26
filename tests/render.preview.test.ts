import { describe, expect, it } from 'vitest';
import { previewPixelRatio } from '../src/render/preview';

describe('software-only adaptive preview resolution', () => {
  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'Mesa softpipe',
    'lavapipe',
    'Software Rasterizer',
    'Microsoft Basic Render Driver (D3D11)',
    'WARP',
    'GDI Generic',
  ])(
    'reduces explicitly identified software rendering to one quarter of the pixels: %s',
    (driver) => {
      expect(previewPixelRatio(driver)).toBe(0.5);
      expect(previewPixelRatio(driver) ** 2).toBe(0.25);
    },
  );
  it.each([
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
    'NVIDIA GeForce RTX 4070',
    'Intel(R) UHD Graphics 620',
    'Mesa Intel(R) Xe Graphics (TGL GT2)',
    'AMD Radeon RX 7600',
    'WebKit WebGL',
    '',
    undefined,
    null,
  ])('retains native preview resolution for hardware and unknown drivers: %s', (driver) => {
    expect(previewPixelRatio(driver)).toBe(1);
  });
});
