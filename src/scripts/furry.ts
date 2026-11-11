import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  QuadraticBezierCurve3,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { springFn } from "./spring";

export type Outfit = "none" | "scarf" | "beanie" | "bow";
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- textures ---------- */

function furNoise() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (g) {
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = Math.random() * 255;
      img.data.set([v, v, v, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.minFilter = t.magFilter = NearestFilter;
  t.generateMipmaps = false;
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

/* ---------- fur: stacked shells, each offset along the normal and thinned by noise ---------- */

const NOISE = furNoise();

type FurOpts = { color: string; tip?: string; rim?: string; layers?: number; length?: number; rep?: [number, number] };

function furShellMaterial(o: Required<FurOpts>, frac: number, offset: number) {
  const m = new MeshStandardMaterial({ color: o.color, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uShell: { value: offset },
      uFrac: { value: frac },
      uNoise: { value: NOISE },
      uTip: { value: new Color(o.tip) },
      uRimCol: { value: new Color(o.rim) },
      uRep: { value: o.rep },
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFurUv; uniform float uShell; uniform vec2 uRep;")
      .replace("#include <begin_vertex>", "vec3 transformed = position + normal * uShell; vFurUv = uv * uRep;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vFurUv; uniform sampler2D uNoise; uniform float uFrac; uniform vec3 uTip; uniform vec3 uRimCol;",
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float fn = texture2D(uNoise, vFurUv).r;
        if (uFrac > 0.0 && fn < uFrac * 0.92) discard;
        diffuseColor.rgb = mix(diffuseColor.rgb * 0.62, mix(diffuseColor.rgb, uTip, 0.4), uFrac);`,
      )
      .replace(
        "#include <dithering_fragment>",
        `float rimF = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
        gl_FragColor.rgb += uRimCol * rimF * (0.05 + 0.2 * uFrac);
        #include <dithering_fragment>`,
      );
  };
  m.customProgramCacheKey = () => "fur";
  return m;
}

function fur(geo: BufferGeometry, opts: FurOpts) {
  const o: Required<FurOpts> = { tip: opts.color, rim: "#ffe2c4", layers: 16, length: 1.7, rep: [1, 0.5], ...opts };
  const g = new Group();
  for (let i = 0; i < o.layers; i++) {
    const frac = i / (o.layers - 1);
    g.add(new Mesh(geo, furShellMaterial(o, frac, frac * o.length)));
  }
  return g;
}

/** Ellipsoid with analytic normals so the fur shells grow evenly along the true surface normal. */
function ellipsoid(a: number, b: number, c: number, thetaLength = Math.PI) {
  const geo = new SphereGeometry(1, 64, 48, 0, Math.PI * 2, 0, thetaLength);
  const p = geo.attributes.position;
  const n = new Float32Array(p.count * 3);
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) / (a * a), p.getY(i) / (b * b), p.getZ(i) / (c * c)).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  geo.scale(a, b, c);
  geo.setAttribute("normal", new Float32BufferAttribute(n, 3));
  return geo;
}

function lookAt(a: Vector3, b: Vector3) {
  const d = b.clone().sub(a);
  const m = new Mesh();
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize());
  return { mesh: m, len: d.length() };
}

/* ---------- character ---------- */

const CREAM = "#F2D0AA";
const PEACH = "#EFA377";
const PEACH_TIP = "#FBC9A0";
const ORANGE = "#F2742A";

function build() {
  const root = new Group();

  // Rotund body.
  const body = fur(ellipsoid(23, 22, 20.5), { color: CREAM, tip: "#FBE2C6", layers: 18 });
  body.position.set(0, -14, 0);
  root.add(body);

  // Hooded head: peach fur with a smooth cream face plate sitting in the opening.
  const head = fur(ellipsoid(22.5, 20.5, 19.5), { color: PEACH, tip: PEACH_TIP, layers: 18 });
  head.position.set(0, 8, 0);
  root.add(head);

  const ears = new Group();
  for (const s of [-1, 1]) {
    const ear = fur(ellipsoid(6, 6.6, 4.6), { color: PEACH, tip: PEACH_TIP, layers: 12, rep: [1, 0.7] });
    ear.position.set(s * 14.5, 26, -1);
    ear.rotation.z = -s * 0.28;
    ears.add(ear);
    const inner = new Mesh(new SphereGeometry(1, 24, 16), new MeshStandardMaterial({ color: "#FFC7AC", roughness: 1 }));
    inner.scale.set(3.6, 4.2, 1.2);
    inner.position.set(s * 14.9, 26, 3);
    inner.rotation.z = -s * 0.28;
    ears.add(inner);
  }
  root.add(ears);

  const plate = new Mesh(
    new SphereGeometry(1, 48, 32),
    new MeshPhysicalMaterial({ color: "#FFF4E6", roughness: 0.55, sheen: 0.5, sheenColor: new Color("#fff") }),
  );
  plate.scale.set(14.6, 12.4, 5);
  plate.position.set(0, 7, 16.6);
  root.add(plate);

  // Fuzzy hood trim around the face opening.
  const trimGeo = new TorusGeometry(1, 0.3, 32, 96);
  trimGeo.scale(15.4, 13, 3.2);
  trimGeo.computeVertexNormals();
  const trim = fur(trimGeo, { color: "#F9CFA6", tip: "#FFE6CC", layers: 14, rep: [6, 1.5], length: 1.4 });
  trim.position.set(0, 7, 17.2);
  root.add(trim);

  // Tiny face.
  const gaze = new Group();
  gaze.position.set(0, 7, 21.4);
  const eyes: Group[] = [];
  const eyeMat = new MeshPhysicalMaterial({ color: "#2b1812", roughness: 0.2, clearcoat: 1 });
  for (const s of [-1, 1]) {
    const eye = new Group();
    const dot = new Mesh(new SphereGeometry(1.75, 24, 16), eyeMat);
    dot.scale.z = 0.6;
    eye.add(dot);
    const shine = new Mesh(new SphereGeometry(0.62, 12, 8), new MeshBasicMaterial({ color: "#fff" }));
    shine.position.set(0.55, 0.7, 1.1);
    eye.add(shine);
    eye.position.set(s * 6.8, 1, 0);
    gaze.add(eye);
    eyes.push(eye);
  }
  const curve = new QuadraticBezierCurve3(new Vector3(-2.2, -2.8, 0), new Vector3(0, -5.2, 0), new Vector3(2.2, -2.8, 0));
  const smileMat = new MeshStandardMaterial({ color: "#B5543A", roughness: 0.6 });
  const smile = new Mesh(new TubeGeometry(curve, 24, 0.4, 10, false), smileMat);
  for (const p of [curve.v0, curve.v2]) {
    const cap = new Mesh(new CircleGeometry(0.4, 10), smileMat);
    cap.position.copy(p);
    smile.add(cap);
  }
  gaze.add(smile);
  const blushTex = softDisc("rgba(255,105,130,0.75)", "rgba(255,105,130,0)");
  for (const s of [-1, 1]) {
    const b = new Mesh(new PlaneGeometry(8.5, 6), new MeshBasicMaterial({ map: blushTex, transparent: true, depthWrite: false }));
    b.position.set(s * 10.5, -2.2, -0.9);
    gaze.add(b);
  }
  root.add(gaze);

  // Feet.
  for (const s of [-1, 1]) {
    const foot = fur(ellipsoid(8, 5.6, 9.5), { color: PEACH, tip: PEACH_TIP, layers: 12, rep: [1, 0.7] });
    foot.position.set(s * 10.5, -33.5, 8);
    root.add(foot);
  }

  // Glass orb held in both arms.
  const orb = new Group();
  orb.position.set(0, -14, 22);
  const glass = new Mesh(
    new SphereGeometry(6.6, 48, 32),
    new MeshPhysicalMaterial({ color: "#ffe2b8", roughness: 0.04, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.38, envMapIntensity: 2.2 }),
  );
  const core = new Mesh(new SphereGeometry(3.3, 32, 24), new MeshBasicMaterial({ color: "#FFC46B" }));
  const halo = new Mesh(
    new PlaneGeometry(26, 26),
    new MeshBasicMaterial({ map: softDisc("rgba(255,190,110,0.8)", "rgba(255,190,110,0)"), transparent: true, depthWrite: false, blending: AdditiveBlending }),
  );
  halo.position.z = 1;
  const light = new PointLight("#ffb866", 900, 70, 2);
  orb.add(glass, core, halo, light);
  root.add(orb);

  // Arms hugging the orb.
  for (const s of [-1, 1]) {
    const a = new Vector3(s * 21, -5, 5);
    const b = new Vector3(s * 8, -15, 20.5);
    const { mesh, len } = lookAt(a, b);
    const armGeo = new CapsuleGeometry(4.6, Math.max(1, len - 9.2), 10, 28);
    armGeo.computeVertexNormals();
    const arm = fur(armGeo, { color: CREAM, tip: "#FBE2C6", layers: 12, rep: [3, 1.5] });
    mesh.add(arm);
    root.add(mesh);
  }

  /* ----- outfits ----- */
  const outfits: Record<Exclude<Outfit, "none">, Group> = { scarf: new Group(), beanie: new Group(), bow: new Group() };

  const knotMat = { color: ORANGE, tip: "#FF9B57", rim: "#ffc9a0" };
  const ringGeo = new TorusGeometry(1, 0.2, 24, 72);
  ringGeo.scale(21.6, 21.6, 21.6);
  ringGeo.rotateX(Math.PI / 2);
  ringGeo.scale(1, 1, 0.92);
  ringGeo.computeVertexNormals();
  const ring = fur(ringGeo, { ...knotMat, layers: 14, rep: [8, 1.5], length: 1.5 });
  ring.position.set(0, -3.4, 0);
  const stripe = new Mesh(new TorusGeometry(21.6 * 1, 1.1, 12, 72), new MeshStandardMaterial({ color: "#FFE9CF", roughness: 1 }));
  stripe.rotation.x = Math.PI / 2;
  stripe.scale.set(1, 0.92, 1);
  stripe.position.set(0, -2.2, 0);
  outfits.scarf.add(ring, stripe);
  const tail = fur(new CapsuleGeometry(3.6, 11, 8, 20), { ...knotMat, layers: 12, rep: [3, 1.5], length: 1.4 });
  tail.position.set(-14, -11, 18);
  tail.rotation.set(0.15, 0.2, 0.14);
  outfits.scarf.add(tail);

  const capGeo = ellipsoid(23.6, 22.2, 20.4, 1.12);
  const cap = fur(capGeo, { ...knotMat, layers: 14, rep: [1, 0.5], length: 1.5 });
  cap.position.set(0, 8.4, -0.4);
  cap.rotation.x = -0.16;
  const brimGeo = new TorusGeometry(1, 0.2, 20, 80);
  brimGeo.scale(21.5, 21.5, 21.5);
  brimGeo.rotateX(Math.PI / 2);
  brimGeo.computeVertexNormals();
  const brim = fur(brimGeo, { color: "#FFE6CC", tip: "#FFF6EA", layers: 12, rep: [8, 1.5], length: 1.3 });
  brim.position.set(0, 8.4 + 22.2 * Math.cos(1.12) - 0.5, 0);
  brim.scale.set(0.93, 1, 0.9);
  brim.position.z = -0.8;
  const pom = fur(ellipsoid(5, 5, 5), { color: "#FFF1DE", tip: "#fff", layers: 14, length: 2, rep: [1, 0.5] });
  pom.position.set(0, 8.4 + 22.2 + 1.6, -2.4);
  outfits.beanie.add(cap, brim, pom);

  const bowMat = new MeshStandardMaterial({ color: ORANGE, roughness: 0.9 });
  const bow = new Group();
  for (const side of [-1, 1]) {
    const wing = new Mesh(new SphereGeometry(1, 32, 24), bowMat);
    wing.scale.set(6, 3.8, 2.4);
    wing.position.set(side * 5.6, 0, 0);
    wing.rotation.z = side * 0.4;
    bow.add(wing);
  }
  bow.add(new Mesh(new SphereGeometry(2.4, 24, 16), bowMat));
  bow.position.set(14.5, 21.5, 12.5);
  bow.rotation.set(0.2, -0.45, -0.35);
  outfits.bow.add(bow);

  for (const o of Object.values(outfits)) {
    o.visible = false;
    root.add(o);
  }

  return { root, eyes, gaze, orb, ears, outfits, halo, light };
}

export function mountFurry(host: HTMLElement) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  host.append(renderer.domElement);
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:manipulation";

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;
  scene.add(new HemisphereLight("#fff0e0", "#e8b08a", 0.55));
  scene.add(new AmbientLight("#fff0dc", 0.15));
  const key = new DirectionalLight("#ffe9cf", 1.7);
  key.position.set(-30, 50, 70);
  scene.add(key);
  const rim = new DirectionalLight("#ffc79e", 1.3);
  rim.position.set(50, 25, -40);
  scene.add(rim);

  const camera = new PerspectiveCamera(30, 1, 1, 600);
  camera.position.set(0, 2, 205);

  const { root, eyes, gaze, orb, ears, outfits, halo, light } = build();
  const mascot = new Group();
  mascot.add(root);
  scene.add(mascot);

  const shadow = new Mesh(new PlaneGeometry(62, 14), new MeshBasicMaterial({ map: softDisc("rgba(80,40,15,0.38)", "rgba(80,40,15,0)"), transparent: true, depthWrite: false }));
  shadow.position.set(0, -40, 0);
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
  let tapAt = -1, blinkAt = born + 2000, happyUntil = 0, outfit: Outfit = "none", swapAt = -1;

  host.addEventListener("pointerdown", () => { tapAt = performance.now(); });
  host.addEventListener("pointerup", () => { happyUntil = performance.now() + 900; });

  const apply = (o: Outfit) => {
    outfit = o;
    for (const [k, g] of Object.entries(outfits)) g.visible = k === o;
    ears.visible = o !== "beanie";
  };

  const render = (now: number) => {
    const t = now / 1000;
    const k = pop.x(Math.min((now - born) / 1000, pop.settle));
    let sx = 1, sy = 1;
    const wob = (at: number, amt: number) => {
      const s = (now - at) / 1000;
      if (s >= jiggle.settle) return false;
      const j = 1 - jiggle.x(s);
      sy -= amt * j;
      sx += amt * 0.6 * j;
      return true;
    };
    if (tapAt > 0 && !wob(tapAt, 0.16)) tapAt = -1;
    if (swapAt > 0 && !wob(swapAt, 0.12)) swapAt = -1;

    lx += (ty * 0.2 - lx) * 0.08;
    ly += (tx * 0.45 - ly) * 0.08;
    const bob = reduced ? 0 : Math.sin(t * 1.6) * 1.2;
    mascot.position.y = bob;
    mascot.rotation.y = ly + (1 - k) * Math.PI * 2 + (reduced ? 0 : Math.sin(t * 0.7) * 0.07);
    mascot.rotation.x = lx;
    const base = Math.max(0.001, k);
    mascot.scale.set(base * sx, base * sy, base * sx);
    gaze.position.x = tx * 0.9;
    gaze.position.y = 7 - ty * 0.6;
    const pulse = 0.85 + 0.15 * Math.sin(t * 2.4);
    halo.scale.setScalar(pulse);
    light.intensity = 900 * pulse;
    orb.position.y = -14 + (reduced ? 0 : Math.sin(t * 1.6 + 0.6) * 0.5);
    shadow.scale.setScalar(base * (1 - bob * 0.02));

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

  if (reduced) render(born + 5000);
  else renderer.setAnimationLoop(render);

  return {
    setOutfit(o: Outfit) {
      apply(o);
      swapAt = performance.now();
      if (reduced) render(born + 5000);
    },
    get outfit() {
      return outfit;
    },
  };
}
