import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferAttribute,
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
  Scene,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CX, CY, HOLE, MARK_H, MARK_W, OUTER } from "../lib/mark";
import { springFn } from "./spring";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** SVG y runs down and three.js y runs up, so mirror every coordinate pair of the absolute path. */
const flipY = (d: string) => d.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_, x, y) => `${x} ${-Number(y)}`);

const loader = new SVGLoader();
function shapeOf(d: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${flipY(d)}"/></svg>`;
  return loader.parse(svg).paths[0].toShapes()[0];
}

const RED = new Color("#E8462A");
const AMBER = new Color("#FFB300");

/** Paint the rim with the brand gradient, red at the bottom left to amber at the top right. */
function paintGradient(geo: ExtrudeGeometry) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + CX) / MARK_W;
    const v = (pos.getY(i) + CY) / MARK_H;
    c.copy(RED).lerp(AMBER, Math.min(1, Math.max(0, (u + v) / 2)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new BufferAttribute(colors, 3));
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
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function buildMascot() {
  const root = new Group();
  const centered = (geo: { translate: (x: number, y: number, z: number) => unknown }) => geo.translate(-CX, CY, 0);

  // Rim: the brand frame, puffy and glossy like candy.
  const frame = shapeOf(OUTER);
  frame.holes.push(shapeOf(HOLE));
  const rimGeo = new ExtrudeGeometry(frame, {
    depth: 6,
    bevelEnabled: true,
    bevelThickness: 3.4,
    bevelSize: 2.6,
    bevelSegments: 12,
    curveSegments: 32,
  });
  centered(rimGeo);
  paintGradient(rimGeo);
  const rim = new Mesh(
    rimGeo,
    new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
  );
  root.add(rim);

  // Face plate, recessed behind the rim.
  const plateGeo = new ExtrudeGeometry(shapeOf(HOLE), { depth: 1.2, bevelEnabled: false, curveSegments: 32 });
  centered(plateGeo);
  plateGeo.translate(0, 0, 0.4);
  const plate = new Mesh(plateGeo, new MeshPhysicalMaterial({ color: "#FFF5E6", roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.25 }));
  root.add(plate);

  // Face: glowing pill eyes, a small smile and soft cheeks.
  const face = new Group();
  face.position.z = 2.1;
  const gaze = new Group();
  const eyeMat = new MeshStandardMaterial({ color: "#FF9A1F", emissive: new Color("#FF6A00"), emissiveIntensity: 0.55, roughness: 0.3 });
  const eyes: Mesh[] = [-1, 1].map((side) => {
    const eye = new Mesh(new CapsuleGeometry(3.5, 6.2, 14, 28), eyeMat);
    eye.scale.z = 0.5;
    eye.position.set(side * 9.4, 2.2, 0);
    gaze.add(eye);
    return eye;
  });
    const smileCurve = new QuadraticBezierCurve3(new Vector3(-4.8, -9.2, 0), new Vector3(0, -13.6, 0), new Vector3(4.8, -9.2, 0));
  const smile = new Mesh(new TubeGeometry(smileCurve, 32, 0.95, 14, false), new MeshStandardMaterial({ color: "#FF7A2B", roughness: 0.4 }));
  for (const p of [smileCurve.v0, smileCurve.v2]) {
    const cap = new Mesh(new CircleGeometry(0.95, 16), smile.material);
    cap.position.copy(p);
    smile.add(cap);
  }
  gaze.add(smile);

  const blushTex = softDisc("rgba(255,105,140,0.55)", "rgba(255,105,140,0)");
  for (const side of [-1, 1]) {
    const blush = new Mesh(new PlaneGeometry(10, 6.4), new MeshBasicMaterial({ map: blushTex, transparent: true, depthWrite: false }));
    blush.position.set(side * 16.5, -6.4, 0.2);
    gaze.add(blush);
  }
  face.add(gaze);
  root.add(face);

  return { root, rim, eyes, gaze };
}

export function mountMascot(host: HTMLElement) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  host.append(renderer.domElement);
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%";

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  scene.add(new AmbientLight("#fff2e0", 0.35));
  const key = new DirectionalLight("#ffe3bd", 1.7);
  key.position.set(-30, 50, 60);
  scene.add(key);
  const rimLight = new DirectionalLight("#ffb072", 1.6);
  rimLight.position.set(50, 20, -40);
  scene.add(rimLight);

  const camera = new PerspectiveCamera(28, 1, 1, 600);
  camera.position.set(0, 0, 188);

  const { root, eyes, gaze } = buildMascot();
  const mascot = new Group();
  mascot.add(root);
  scene.add(mascot);

  const shadowTex = softDisc("rgba(60,30,10,0.34)", "rgba(60,30,10,0)");
  const shadow = new Mesh(new PlaneGeometry(52, 12), new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.position.set(0, -46, 0);
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

  let lookX = 0, lookY = 0, tx = 0, ty = 0;
  addEventListener("pointermove", (e) => {
    tx = (e.clientX / innerWidth - 0.5) * 2;
    ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  const pop = springFn(2.2, 0.55);
  const bounce = springFn(3, 0.5);
  let bornAt = performance.now();
  let tapAt = -1;
  let blinkAt = performance.now() + 1800;
  let happyUntil = 0;

  host.addEventListener("pointerdown", () => { tapAt = performance.now(); });
  host.addEventListener("pointerup", () => { happyUntil = performance.now() + 900; });

  const render = (now: number) => {
    const t = now / 1000;
    const born = Math.min((now - bornAt) / 1000, pop.settle);
    const k = pop.x(born);
    const spin = (1 - k) * Math.PI * 2;
    let squash = 1;
    if (tapAt > 0) {
      const s = (now - tapAt) / 1000;
      if (s < bounce.settle) squash = 1 - 0.12 * (1 - bounce.x(s)) ;
      else tapAt = -1;
    }

    lookX += (ty * 0.28 - lookX) * 0.08;
    lookY += (tx * 0.5 - lookY) * 0.08;
    const bob = reduced ? 0 : Math.sin(t * 1.6) * 1.7;
    mascot.position.y = bob;
    mascot.rotation.y = lookY + spin + (reduced ? 0 : Math.sin(t * 0.7) * 0.1);
    mascot.rotation.x = lookX + (reduced ? 0 : Math.sin(t * 0.9) * 0.035);
    mascot.rotation.z = (reduced ? 0 : Math.sin(t * 0.8) * 0.02);
    mascot.scale.setScalar(Math.max(0.001, k) * squash);
    gaze.position.x = tx * 1.3;
    gaze.position.y = -ty * 0.9;
    shadow.scale.setScalar(Math.max(0.001, k) * (1 - bob * 0.018));
    (shadow.material as MeshBasicMaterial).opacity = 0.85 - bob * 0.05;

    let eyeY = 1;
    let eyeX = 1;
    if (now > blinkAt) {
      const p = (now - blinkAt) / 220;
      eyeY = p < 1 ? 1 - 0.92 * Math.sin(Math.PI * p) : 1;
      if (p >= 1) blinkAt = now + 2400 + Math.random() * 3000;
    }
    if (now < happyUntil) {
      const p = 1 - (happyUntil - now) / 900;
      const sq = Math.sin(Math.min(1, p * 1.4) * Math.PI);
      eyeY = Math.min(eyeY, 1 - 0.6 * sq);
      eyeX = 1 + 0.12 * sq;
    }
    for (const e of eyes) e.scale.set(eyeX, eyeY, 0.5);

    renderer.render(scene, camera);
  };

  if (reduced) {
    bornAt = -1e9;
    render(performance.now());
    return;
  }
  renderer.setAnimationLoop(render);
}
