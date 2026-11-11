import {
  ACESFilmicToneMapping,
  AmbientLight,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  QuadraticBezierCurve3,
  RepeatWrapping,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { springFn } from "./spring";

export type Style = "plush" | "clay" | "jelly";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

function noiseTexture(size = 256, strength = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (g) {
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = 128 + (Math.random() - 0.5) * 255 * strength;
      img.data.set([v, v, v, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(5, 5);
  return t;
}

function softDisc(inner: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function bodyMaterial(style: Style, color: string) {
  if (style === "plush") {
    const m = new MeshPhysicalMaterial({
      color,
      roughness: 0.95,
      sheen: 1,
      sheenRoughness: 0.35,
      sheenColor: new Color("#ffd2a0"),
      bumpMap: noiseTexture(256, 1),
      bumpScale: 2.2,
    });
    return m;
  }
  if (style === "clay") {
    return new MeshPhysicalMaterial({ color, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.45 });
  }
  return new MeshPhysicalMaterial({ color, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, transmission: 0.25, thickness: 6, ior: 1.4 });
}

function bolt(color: string) {
  const s = new Shape();
  s.moveTo(2.6, 7);
  s.lineTo(-3.4, -0.6);
  s.lineTo(-0.2, -0.6);
  s.lineTo(-2.4, -7);
  s.lineTo(3.6, 0.8);
  s.lineTo(0.4, 0.8);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.9, bevelSize: 0.9, bevelSegments: 5 });
  return new Mesh(g, new MeshStandardMaterial({ color, emissive: new Color("#FF7A00"), emissiveIntensity: 0.5, roughness: 0.3 }));
}

function build(style: Style) {
  const root = new Group();
  const orange = style === "clay" ? "#FF8A3D" : "#FF7E2E";
  const mat = bodyMaterial(style, orange);

  // Squishy rounded body, the Power.day rounded square turned into a plush bean.
  const body = new Mesh(new RoundedBoxGeometry(46, 44, 34, 10, 17), mat);
  body.position.y = -1;
  root.add(body);

  // Hood-like top: two small round ears.
  for (const s of [-1, 1]) {
    const ear = new Mesh(new SphereGeometry(6.2, 32, 24), mat);
    ear.scale.set(1, 1.15, 0.8);
    ear.position.set(s * 15.5, 22.5, -1);
    root.add(ear);
    const inner = new Mesh(new SphereGeometry(3.6, 24, 16), new MeshStandardMaterial({ color: "#FFC9A3", roughness: 0.9 }));
    inner.scale.set(1, 1.15, 0.5);
    inner.position.set(s * 15.5, 22.5, 2.6);
    root.add(inner);
  }

  // Cream face plate.
  const plate = new Mesh(
    new SphereGeometry(1, 48, 32),
    new MeshPhysicalMaterial({ color: "#FFF1DE", roughness: style === "plush" ? 0.9 : 0.45, sheen: style === "plush" ? 0.6 : 0, sheenColor: new Color("#fff"), clearcoat: style === "jelly" ? 0.8 : 0.15 }),
  );
  plate.scale.set(18.5, 15, 5);
  plate.position.set(0, 1.4, 15.2);
  root.add(plate);

  // Face
  const face = new Group();
  face.position.set(0, 1.4, 20);
  const eyeMat = new MeshPhysicalMaterial({ color: "#2a1712", roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 });
  const eyes: Group[] = [];
  const gaze = new Group();
  for (const s of [-1, 1]) {
    const eye = new Group();
    const ball = new Mesh(new SphereGeometry(3.7, 32, 24), eyeMat);
    ball.scale.set(1, 1.18, 0.55);
    eye.add(ball);
    const hi = new Mesh(new SphereGeometry(1.15, 16, 12), new MeshBasicMaterial({ color: "#fff" }));
    hi.position.set(1.2, 2.2, 1.7);
    eye.add(hi);
    const hi2 = new Mesh(new SphereGeometry(0.55, 12, 8), new MeshBasicMaterial({ color: "#fff" }));
    hi2.position.set(-1.4, -1.6, 1.8);
    eye.add(hi2);
    eye.position.set(s * 8.2, 1.6, 0);
    gaze.add(eye);
    eyes.push(eye);
  }
  const curve = new QuadraticBezierCurve3(new Vector3(-3.6, -4.6, 0), new Vector3(0, -8, 0), new Vector3(3.6, -4.6, 0));
  const smileMat = new MeshStandardMaterial({ color: "#C4472A", roughness: 0.5 });
  const smile = new Mesh(new TubeGeometry(curve, 28, 0.75, 12, false), smileMat);
  for (const p of [curve.v0, curve.v2]) {
    const cap = new Mesh(new CircleGeometry(0.75, 12), smileMat);
    cap.position.copy(p);
    smile.add(cap);
  }
  gaze.add(smile);
  const blushTex = softDisc("rgba(255,96,130,0.7)", "rgba(255,96,130,0)");
  for (const s of [-1, 1]) {
    const b = new Mesh(new PlaneGeometry(10, 7), new MeshBasicMaterial({ map: blushTex, transparent: true, depthWrite: false }));
    b.position.set(s * 13.5, -3.6, 0.1);
    gaze.add(b);
  }
  face.add(gaze);
  root.add(face);

  // Little arms and feet.
  for (const s of [-1, 1]) {
    const arm = new Mesh(new CapsuleGeometry(4, 7, 8, 20), mat);
    arm.position.set(s * 25.5, -6, 3);
    arm.rotation.z = s * 0.45;
    root.add(arm);
    const foot = new Mesh(new SphereGeometry(7, 28, 20), mat);
    foot.scale.set(1, 0.6, 1.1);
    foot.position.set(s * 11, -24.5, 5);
    root.add(foot);
  }

  // Power bolt charm on the forehead tuft.
  const b = bolt("#FFC21A");
  b.position.set(0, 25.5, 1.5);
  b.scale.setScalar(0.9);
  b.rotation.z = -0.1;
  root.add(b);

  return { root, eyes, gaze, bolt: b };
}

export function mountPlush(host: HTMLElement, style: Style) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  host.append(renderer.domElement);
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%";

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.add(new AmbientLight("#fff0dc", 0.55));
  const key = new DirectionalLight("#ffe6c4", 1.9);
  key.position.set(-30, 50, 70);
  scene.add(key);
  const rim = new DirectionalLight("#ffb98a", 1.5);
  rim.position.set(50, 25, -40);
  scene.add(rim);

  const camera = new PerspectiveCamera(28, 1, 1, 600);
  camera.position.set(0, 2, 200);

  const { root, eyes, gaze, bolt: charm } = build(style);
  const mascot = new Group();
  mascot.add(root);
  scene.add(mascot);

  const shadow = new Mesh(new PlaneGeometry(56, 13), new MeshBasicMaterial({ map: softDisc("rgba(70,35,10,0.36)", "rgba(70,35,10,0)"), transparent: true, depthWrite: false }));
  shadow.position.set(0, -32, 0);
  shadow.rotation.x = -0.25;
  scene.add(shadow);

  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(host);

  let tx = 0, ty = 0, lx = 0, ly = 0;
  addEventListener("pointermove", (e) => {
    tx = (e.clientX / innerWidth - 0.5) * 2;
    ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  const pop = springFn(2.2, 0.5);
  const jiggle = springFn(3.2, 0.35);
  const born = performance.now();
  let tapAt = -1;
  let blinkAt = born + 2000;
  let happyUntil = 0;
  host.addEventListener("pointerdown", () => { tapAt = performance.now(); });
  host.addEventListener("pointerup", () => { happyUntil = performance.now() + 900; });

  const render = (now: number) => {
    const t = now / 1000;
    const k = pop.x(Math.min((now - born) / 1000, pop.settle));
    let sx = 1, sy = 1;
    if (tapAt > 0) {
      const s = (now - tapAt) / 1000;
      if (s < jiggle.settle) {
        const j = 1 - jiggle.x(s);
        sy = 1 - 0.16 * j;
        sx = 1 + 0.1 * j;
      } else tapAt = -1;
    }
    lx += (ty * 0.2 - lx) * 0.08;
    ly += (tx * 0.45 - ly) * 0.08;
    const bob = reduced ? 0 : Math.sin(t * 1.6) * 1.4;
    mascot.position.y = bob;
    mascot.rotation.y = ly + (1 - k) * Math.PI * 2 + (reduced ? 0 : Math.sin(t * 0.7) * 0.08);
    mascot.rotation.x = lx;
    mascot.scale.set(Math.max(0.001, k) * sx, Math.max(0.001, k) * sy, Math.max(0.001, k) * sx);
    gaze.position.x = tx * 1.2;
    gaze.position.y = -ty * 0.8;
    charm.rotation.z = -0.1 + (reduced ? 0 : Math.sin(t * 2.2) * 0.07);
    shadow.scale.setScalar(Math.max(0.001, k) * (1 - bob * 0.02));

    let ey = 1, ex = 1;
    if (now > blinkAt) {
      const p = (now - blinkAt) / 200;
      ey = p < 1 ? 1 - 0.9 * Math.sin(Math.PI * p) : 1;
      if (p >= 1) blinkAt = now + 2200 + Math.random() * 2800;
    }
    if (now < happyUntil) {
      const p = 1 - (happyUntil - now) / 900;
      const sq = Math.sin(Math.min(1, p * 1.4) * Math.PI);
      ey = Math.min(ey, 1 - 0.55 * sq);
      ex = 1 + 0.15 * sq;
    }
    for (const e of eyes) e.scale.set(ex, ey, 1);
    renderer.render(scene, camera);
  };

  if (reduced) {
    render(born + 5000);
    return;
  }
  renderer.setAnimationLoop(render);
}
