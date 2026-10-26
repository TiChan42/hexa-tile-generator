/** Reduce preview fragment work only when the driver explicitly identifies CPU rendering. */
export function previewPixelRatio(driver?: string | null): 0.5 | 1 {
  if (!driver) return 1;
  return /swiftshader|llvmpipe|softpipe|lavapipe|swrast|software|microsoft basic render driver|\bwarp\b|gdi generic/i.test(
    driver,
  )
    ? 0.5
    : 1;
}

/** Driver information may be hidden by privacy settings; preserve normal quality in that case. */
export function detectPreviewPixelRatio(
  context: WebGLRenderingContext | WebGL2RenderingContext,
): 0.5 | 1 {
  try {
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    const renderer: unknown = context.getParameter(
      debug?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER,
    );
    return previewPixelRatio(typeof renderer === 'string' ? renderer : undefined);
  } catch {
    return 1;
  }
}
