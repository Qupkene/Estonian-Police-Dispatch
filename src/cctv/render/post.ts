/**
 * What makes the drawn street a camera picture (docs/CCTV.md). Two passes over the small frame:
 *
 * 1. the lens and the sensor: the bulge of a wide-angle lens, a slightly soft picture with colour fringes, drops on
 *    the dome when it rains, digital zoom, and the trail moving things leave in poor light;
 * 2. the recorder and the screen: grain, the blocks of a thin video stream, infrared black-and-white at night,
 *    dark corners, scan lines, a torn line now and then, the lifted blacks of a cheap picture, and the text burned
 *    into it (the camera's name, the clock, the game's own mark).
 */
import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  NearestFilter,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const LENS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tPrev;
uniform sampler2D tDrops;
uniform vec2 uTexel;
uniform float uBarrel;
uniform float uZoom;
uniform vec2 uPan;
uniform float uRain;
uniform float uTrail;
uniform float uSoft;

vec2 lens(vec2 uv) {
  vec2 c = uv - 0.5;
  c.x *= 1.7778;
  float r2 = dot(c, c);
  c *= 1.0 + uBarrel * r2;
  c.x /= 1.7778;
  // Pull in a little so that the bulge leaves no empty corners.
  return c * (1.0 - uBarrel * 0.42) + 0.5;
}

vec3 soft(vec2 uv, float k) {
  vec2 d = uTexel * k;
  vec3 c = texture2D(tScene, uv).rgb * 0.4;
  c += texture2D(tScene, uv + vec2(d.x, 0.0)).rgb * 0.15;
  c += texture2D(tScene, uv - vec2(d.x, 0.0)).rgb * 0.15;
  c += texture2D(tScene, uv + vec2(0.0, d.y)).rgb * 0.15;
  c += texture2D(tScene, uv - vec2(0.0, d.y)).rgb * 0.15;
  return c;
}

void main() {
  vec2 uv = (vUv - 0.5) / uZoom + 0.5 + uPan;
  uv = lens(uv);
  float blur = uSoft;
  if (uRain > 0.0) {
    vec4 d = texture2D(tDrops, vUv);
    uv += (d.rg - 0.5) * 0.16 * uRain * step(0.02, d.b);
    blur += d.b * 3.0 * uRain;
  }
  // Colour fringes grow towards the edges.
  vec2 off = (uv - 0.5) * 0.0045;
  vec3 c = soft(uv, blur);
  c.r = soft(uv + off, blur).r;
  c.b = soft(uv - off, blur).b;
  vec3 prev = texture2D(tPrev, vUv).rgb;
  gl_FragColor = vec4(mix(c, prev, uTrail), 1.0);
}`;

const MONITOR = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSensor;
uniform sampler2D tOsd;
uniform vec2 uSize;
uniform float uSeed;
uniform float uNoise;
uniform float uMono;
uniform vec3 uTint;
uniform float uGain;
uniform float uLift;
uniform float uContrast;
uniform float uSaturation;
uniform float uBlocks;
uniform float uVignette;
uniform float uScan;
uniform float uTear;
uniform float uTearY;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 toScreen(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 uv = vUv;
  // A torn line: a band of rows slips sideways for a frame.
  float band = smoothstep(0.035, 0.0, abs(uv.y - uTearY));
  uv.x += band * uTear * 0.06;
  vec3 c = texture2D(tSensor, uv).rgb;

  // A thin stream keeps brightness per pixel but colour only per block, and smears busy blocks.
  vec2 cell = (floor(uv * uSize / 8.0) + 0.5) * 8.0 / uSize;
  vec3 blk = texture2D(tSensor, cell).rgb;
  float y = luma(c);
  c = mix(c, vec3(y) + (blk - vec3(luma(blk))), uBlocks);
  c = mix(c, blk, uBlocks * 0.28);

  c *= uGain;
  float g = luma(c);
  c = mix(vec3(g), c, uSaturation);
  // Infrared at night: black and white, brightest where the camera's own lamp points.
  if (uMono > 0.5) {
    float spot = smoothstep(0.85, 0.12, distance(uv, vec2(0.5, 0.56)));
    c = vec3(g) * mix(0.62, 1.12, spot);
  }
  c *= uTint;
  c = (c - 0.5 * 0.18) * uContrast + 0.5 * 0.18 + uLift;

  float v = distance(uv, vec2(0.5));
  c *= 1.0 - uVignette * smoothstep(0.35, 0.85, v);
  c *= 1.0 - uScan * step(0.5, fract(gl_FragCoord.y * 0.5));

  c = toScreen(clamp(c, 0.0, 1.0));
  // Grain, as the eye sees it: a little stronger in the dark parts, and coarser in colour than in brightness.
  vec2 px = floor(uv * uSize);
  float dark = 1.2 - luma(c);
  c += (hash(px + uSeed * 61.7) - 0.5) * uNoise * 2.0 * dark;
  vec2 cpx = floor(px / 2.0);
  float chroma = uNoise * (1.0 - uMono) * dark;
  c.r += (hash(cpx + uSeed * 17.3) - 0.5) * chroma;
  c.b += (hash(cpx + uSeed * 29.1 + 7.0) - 0.5) * chroma;
  vec4 osd = texture2D(tOsd, vUv);
  c = mix(c, osd.rgb, osd.a);
  gl_FragColor = vec4(c, 1.0);
}`;

export interface PostLook {
  /** Lens bulge, 0 none .. 0.2 strong. */
  barrel: number;
  /** Softness in pixels. */
  soft: number;
  /** How much of the last frame stays in this one (0..0.6): the trail of moving things in poor light. */
  trail: number;
  noise: number;
  /** Infrared black-and-white. */
  mono: boolean;
  tint: [number, number, number];
  gain: number;
  lift: number;
  contrast: number;
  saturation: number;
  /** The blocks of a thin video stream, 0..1. */
  blocks: number;
  vignette: number;
  scan: number;
  /** Rain on the dome, 0..1. */
  rain: number;
}

export class Post {
  private scene = new Scene();
  private cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: Mesh;
  private lens: ShaderMaterial;
  private monitor: ShaderMaterial;
  /** The street is drawn into this. */
  readonly frame: WebGLRenderTarget;
  private a: WebGLRenderTarget;
  private b: WebGLRenderTarget;
  private osdCanvas: HTMLCanvasElement;
  private osd: CanvasTexture;
  private osdKey = '';
  private n = 0;

  constructor(
    private readonly renderer: WebGLRenderer,
    readonly width: number,
    readonly height: number,
    drops: Texture,
  ) {
    const target = (depth: boolean) => {
      const t = new WebGLRenderTarget(width, height, { depthBuffer: depth, magFilter: LinearFilter, minFilter: LinearFilter });
      // Stored the way a screen stores colour: dark tones keep their steps in 8 bits.
      t.texture.colorSpace = SRGBColorSpace;
      return t;
    };
    this.frame = target(true);
    this.a = target(false);
    this.b = target(false);
    this.osdCanvas = document.createElement('canvas');
    this.osdCanvas.width = width;
    this.osdCanvas.height = height;
    this.osd = new CanvasTexture(this.osdCanvas);
    this.osd.colorSpace = NoColorSpace;
    this.osd.magFilter = NearestFilter;
    this.osd.minFilter = NearestFilter;
    this.osd.generateMipmaps = false;
    this.lens = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: LENS,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.frame.texture },
        tPrev: { value: this.b.texture },
        tDrops: { value: drops },
        uTexel: { value: new Vector2(1 / width, 1 / height) },
        uBarrel: { value: 0.12 },
        uZoom: { value: 1 },
        uPan: { value: new Vector2(0, 0) },
        uRain: { value: 0 },
        uTrail: { value: 0.1 },
        uSoft: { value: 0.6 },
      },
    });
    this.monitor = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: MONITOR,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tSensor: { value: this.a.texture },
        tOsd: { value: this.osd },
        uSize: { value: new Vector2(width, height) },
        uSeed: { value: 0 },
        uNoise: { value: 0.05 },
        uMono: { value: 0 },
        uTint: { value: new Vector3(1, 1, 1) },
        uGain: { value: 1 },
        uLift: { value: 0.02 },
        uContrast: { value: 1 },
        uSaturation: { value: 0.85 },
        uBlocks: { value: 0.3 },
        uVignette: { value: 0.3 },
        uScan: { value: 0.05 },
        uTear: { value: 0 },
        uTearY: { value: 0.5 },
      },
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.lens);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setLook(l: PostLook) {
    const u = this.lens.uniforms;
    u.uBarrel.value = l.barrel;
    u.uSoft.value = l.soft;
    u.uTrail.value = l.trail;
    u.uRain.value = l.rain;
    const m = this.monitor.uniforms;
    m.uNoise.value = l.noise;
    m.uMono.value = l.mono ? 1 : 0;
    (m.uTint.value as Vector3).set(l.tint[0], l.tint[1], l.tint[2]);
    m.uGain.value = l.gain;
    m.uLift.value = l.lift;
    m.uContrast.value = l.contrast;
    m.uSaturation.value = l.saturation;
    m.uBlocks.value = l.blocks;
    m.uVignette.value = l.vignette;
    m.uScan.value = l.scan;
  }

  /** Digital zoom (1 = the whole picture) and where the zoomed window sits (-0.5..0.5 of the picture). */
  setZoom(zoom: number, panX: number, panY: number) {
    const z = Math.max(1, Math.min(4, zoom));
    const room = (1 - 1 / z) / 2;
    this.lens.uniforms.uZoom.value = z;
    (this.lens.uniforms.uPan.value as Vector2).set(Math.max(-room, Math.min(room, panX)), Math.max(-room, Math.min(room, panY)));
  }

  /** The text burned into the picture: redrawn only when it changes. */
  setText(lines: { topLeft: string; topRight: string; bottomLeft: string; bottomRight: string; rec: boolean }) {
    const key = `${lines.topLeft}|${lines.topRight}|${lines.bottomLeft}|${lines.bottomRight}|${lines.rec}`;
    if (key === this.osdKey) return;
    this.osdKey = key;
    const g = this.osdCanvas.getContext('2d')!;
    const w = this.width;
    const h = this.height;
    g.clearRect(0, 0, w, h);
    const size = Math.max(9, Math.round(h / 24));
    g.font = `700 ${size}px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace`;
    g.textBaseline = 'top';
    const put = (text: string, x: number, y: number, align: CanvasTextAlign, alpha = 1) => {
      if (!text) return;
      g.textAlign = align;
      g.fillStyle = `rgba(0,0,0,${0.85 * alpha})`;
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [1, 0]]) g.fillText(text, x + dx, y + dy);
      g.fillStyle = `rgba(255,255,255,${0.95 * alpha})`;
      g.fillText(text, x, y);
    };
    const m = Math.round(h / 28);
    put(lines.topLeft, m + (lines.rec ? size : 0), m, 'left');
    put(lines.topRight, w - m, m, 'right');
    put(lines.bottomLeft, m, h - m - size, 'left');
    put(lines.bottomRight, w - m, h - m - size, 'right', 0.8);
    if (lines.rec) {
      g.fillStyle = 'rgba(230,40,30,0.95)';
      g.beginPath();
      g.arc(m + size * 0.35, m + size * 0.5, size * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    this.osd.needsUpdate = true;
  }

  /** After the street was drawn into `frame`: the two passes, the second to the screen. `tear`: 0, or a torn line's strength and height. */
  render(tear = 0, tearY = 0.5) {
    const r = this.renderer;
    this.n++;
    // 1. Lens and sensor, into a (reading the last picture from b).
    this.quad.material = this.lens;
    this.lens.uniforms.tPrev.value = this.b.texture;
    r.setRenderTarget(this.a);
    r.render(this.scene, this.cam);
    // 2. Recorder and screen.
    this.quad.material = this.monitor;
    const m = this.monitor.uniforms;
    m.tSensor.value = this.a.texture;
    m.uSeed.value = (this.n * 0.6180339) % 1;
    m.uTear.value = tear;
    m.uTearY.value = tearY;
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
    const t = this.a;
    this.a = this.b;
    this.b = t;
  }

  dispose() {
    this.frame.dispose();
    this.a.dispose();
    this.b.dispose();
    this.osd.dispose();
    this.lens.dispose();
    this.monitor.dispose();
    this.quad.geometry.dispose();
  }
}
