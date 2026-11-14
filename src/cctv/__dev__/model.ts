// Dev-only: draws a glTF model four times, turned a quarter each (see model.html).
import { AmbientLight, Box3, Color, DirectionalLight, MeshLambertMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer, type Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setSize(1200, 600, false);
const scene = new Scene();
scene.background = new Color(0x8a94a0);
scene.add(new AmbientLight(0xffffff, 1.4));
const sun = new DirectionalLight(0xffffff, 3);
sun.position.set(3, 5, 4);
scene.add(sun);
const log = document.getElementById('log')!;
new GLTFLoader().load(q.get('src')!, (gltf) => {
  const box = new Box3().setFromObject(gltf.scene);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  const names: string[] = [];
  gltf.scene.traverse((o: Object3D) => {
    names.push(`${o.type}:${o.name}`);
    const m = o as Mesh;
    if (m.isMesh && q.get('plain')) m.material = new MeshLambertMaterial({ color: 0xb0b0b0 });
  });
  log.textContent = `size ${size.x.toFixed(2)} ${size.y.toFixed(2)} ${size.z.toFixed(2)} | animations ${gltf.animations.map((a) => a.name + ':' + a.duration.toFixed(2)).join(',')} | ${names.slice(0, 40).join(' ')}`;
  // One model, drawn four times into four columns, turned a quarter each time.
  const n = 4;
  const holder = new Scene();
  holder.add(gltf.scene);
  gltf.scene.position.sub(centre);
  scene.add(holder);
  const span = Math.max(size.x, size.z, size.y * 0.6) * 1.15;
  const cam = new PerspectiveCamera(30, 0.5, 0.05, 200);
  const d = (Math.max(span, size.y * 1.05) / 2 / Math.tan((15 * Math.PI) / 180)) * 1.05;
  cam.position.set(0, size.y * Number(q.get('up') ?? 0.25), d);
  cam.lookAt(0, 0, 0);
  renderer.setScissorTest(true);
  renderer.autoClear = false;
  for (let i = 0; i < n; i++) {
    holder.rotation.y = (i * Math.PI) / 2 + Number(q.get('turn') ?? 0.5);
    renderer.setViewport(i * 300, 0, 300, 600);
    renderer.setScissor(i * 300, 0, 300, 600);
    renderer.clear();
    renderer.render(scene, cam);
  }
  (window as unknown as { __ready: boolean }).__ready = true;
});
