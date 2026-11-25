// Juhtimiskeskuse saal (docs/MULTIPLAYER.md section 19): what the browser would draw the room with. Small and free
// of three.js, so that the stage asks it before it fetches the room's chunk: a browser without a graphics card gets
// the duty map and never loads the 3D room (compiled and drawn by the processor, the room held the page up, and every
// page of the same browser with it).

/** The names software renderers give themselves: SwiftShader, llvmpipe and the like, where a browser blocks the card. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i;

/** What draws: a graphics card, the processor (a software renderer), or nothing (no WebGL 2). */
export type RenderKind = 'gpu' | 'software' | 'none';

/** Whether this context is drawn by the processor: the renderer's own name, unmasked where the browser gives it. */
export function isSoftware(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return SOFTWARE.test(String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? ''));
}

/** What this browser would draw the room with. The probe's context is given back at once: a page may hold only a few. */
export function probeRender(): RenderKind {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'none';
    const kind = isSoftware(gl) ? 'software' : 'gpu';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return kind;
  } catch {
    return 'none';
  }
}

/**
 * The room is drawn even by the processor: the e2e tests' browser has no graphics card, and `e2e/lobby-stage.spec.ts`
 * still draws the room (localStorage "epd:stage3d" set to "on"). Players without a card get the duty map.
 */
export function stageForced(): boolean {
  try {
    return localStorage.getItem('epd:stage3d') === 'on';
  } catch {
    return false;
  }
}
