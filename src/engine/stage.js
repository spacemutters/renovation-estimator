// The 3D stage: renderer, camera, orbit (mouse, touch and arrow keys), picking, the selection outline,
// day and evening lighting, and camera moves. Renders only when something changes (kind to phones and batteries).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setAnisotropy } from './textures.js';

const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

export function createStage({ canvas, host, reducedMotion, brandColor, coarse }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const pr = Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2);
  renderer.setPixelRatio(pr);
  setAnisotropy(renderer.capabilities.getMaxAnisotropy());
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.95;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);
  const key = new THREE.DirectionalLight(0xFFF3E6, 2.4);
  key.position.set(4.5, 7.5, 6);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -4.6, right: 4.6, top: 4.6, bottom: -4.6, near: 1, far: 24 });
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
  scene.add(key, key.target);
  const hemi = new THREE.HemisphereLight(0xFFE2C0, 0x2A2018, 0);
  scene.add(hemi);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.085;
  controls.enablePan = false;
  controls.minDistance = 0.9; controls.maxDistance = 10;
  controls.minPolarAngle = 0.32; controls.maxPolarAngle = 1.45;
  controls.minAzimuthAngle = -0.35; controls.maxAzimuthAngle = 1.4;
  controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.7;
  controls.autoRotateSpeed = 0.7;

  // ---------------------------------------------------------------- post: render -> selection outline -> output
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const outline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
  const brand = new THREE.Color(brandColor);
  outline.visibleEdgeColor.copy(brand).offsetHSL(0, 0.05, 0.12);
  outline.hiddenEdgeColor.set(0x000000);   // no outlines drawn through other objects
  outline.edgeStrength = 3.2; outline.edgeGlow = 0.35; outline.edgeThickness = 1.4;
  composer.addPass(outline);
  composer.addPass(new OutputPass());

  let room = null, needs = true, tweens = [], fit = 1, nightT = 0, selected = null, previewing = null;
  const invalidate = () => { needs = true; };
  controls.addEventListener('change', invalidate);

  // ---------------------------------------------------------------- size
  function resize() {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr); composer.setSize(w, h);
    outline.resolution.set(w * pr, h * pr);
    camera.aspect = w / h;
    // narrow screens: step back so the whole kitchen still fits
    const nf = Math.max(1, 1.22 / camera.aspect) ** 0.85;
    if (fit !== nf) {
      const off = camera.position.clone().sub(controls.target).multiplyScalar(nf / fit);
      camera.position.copy(controls.target).add(off);
      fit = nf;
    }
    camera.updateProjectionMatrix();
    controls.update();
    invalidate();
  }
  new ResizeObserver(resize).observe(host);

  // ---------------------------------------------------------------- tweens
  function tween(dur, step, done) {
    if (reducedMotion || dur <= 0) { step(1); done && done(); invalidate(); return; }
    const tw = { t0: performance.now(), dur, step, done };
    tweens.push(tw);
    return tw;
  }
  let fly = null;
  controls.addEventListener('start', () => { if (fly) { tweens = tweens.filter((t) => t !== fly); fly = null; } });

  function viewVectors(v) {
    const target = new THREE.Vector3(...v.target);
    const pos = new THREE.Vector3(...v.pos).sub(target).multiplyScalar(fit).add(target);
    return { pos, target };
  }
  function flyTo(v, dur = 950) {
    const { pos, target } = viewVectors(v);
    const p0 = camera.position.clone(), t0 = controls.target.clone();
    // travel on a gentle arc: interpolate around the target, not through the room
    const s0 = new THREE.Spherical().setFromVector3(p0.clone().sub(t0));
    const s1 = new THREE.Spherical().setFromVector3(pos.clone().sub(target));
    if (fly) tweens = tweens.filter((t) => t !== fly);
    fly = tween(dur, (k) => {
      const e = easeInOut(k);
      const tg = t0.clone().lerp(target, e);
      const s = new THREE.Spherical(lerp(s0.radius, s1.radius, e), lerp(s0.phi, s1.phi, e), lerp(s0.theta, s1.theta, e));
      camera.position.copy(tg).add(new THREE.Vector3().setFromSpherical(s));
      controls.target.copy(tg);
      camera.lookAt(tg);
    }, () => { fly = null; controls.update(); });
  }

  // ---------------------------------------------------------------- loop
  let autoRotate = false;
  function loop(now) {
    requestAnimationFrame(loop);
    if (tweens.length) {
      tweens = tweens.filter((tw) => {
        const k = Math.min(1, (now - tw.t0) / tw.dur);
        tw.step(k);
        if (k >= 1) { tw.done && tw.done(); return false; }
        return true;
      });
      needs = true;
    }
    if (autoRotate) {
      const az = controls.getAzimuthalAngle();
      if (az <= controls.minAzimuthAngle + 0.02) controls.autoRotateSpeed = -Math.abs(controls.autoRotateSpeed);
      if (az >= controls.maxAzimuthAngle - 0.02) controls.autoRotateSpeed = Math.abs(controls.autoRotateSpeed);
    }
    if (!fly && controls.update()) needs = true;
    if (needs) { needs = false; composer.render(); }
  }
  requestAnimationFrame(loop);

  // ---------------------------------------------------------------- picking
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function partAt(clientX, clientY) {
    if (!room) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const hit of ray.intersectObject(room.root, true)) {
      for (let o = hit.object; o; o = o.parent) {
        if (!o.visible) break;
        if (o.userData.part) return o.userData.part;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- selection outline
  function outlineFor(id) { return id && room ? room.partObjects[id] || [] : []; }
  function refreshOutline() { outline.selectedObjects = outlineFor(previewing || selected); invalidate(); }
  function select(id) { selected = id; refreshOutline(); }
  function preview(id) { previewing = id; refreshOutline(); }
  function pulse() {
    if (reducedMotion) return;
    tween(700, (k) => { outline.edgeStrength = lerp(7, 3.2, k); outline.edgeGlow = lerp(1.2, 0.35, k); });
  }

  // ---------------------------------------------------------------- day and evening
  function setEvening(on) {
    const from = nightT, to = on ? 1 : 0;
    host.classList.toggle('is-evening', on);
    tween(900, (k) => {
      const t = lerp(from, to, easeInOut(k));
      nightT = t;
      scene.environmentIntensity = lerp(0.95, 0.05, t);
      key.intensity = lerp(2.4, 0, t);
      hemi.intensity = lerp(0, 0.28, t);
      renderer.toneMappingExposure = lerp(1.0, 1.12, t);
      room && room.setNight(t);
    });
  }

  // ---------------------------------------------------------------- keyboard orbit on the canvas
  canvas.addEventListener('keydown', (e) => {
    const step = 0.14;
    let used = true;
    switch (e.key) {
      case 'ArrowLeft': controls.rotateLeft(-step); break;
      case 'ArrowRight': controls.rotateLeft(step); break;
      case 'ArrowUp': controls.rotateUp(step * 0.6); break;
      case 'ArrowDown': controls.rotateUp(-step * 0.6); break;
      case '+': case '=': controls.dollyIn(1.12); controls.update(); break;
      case '-': case '_': controls.dollyOut(1.12); controls.update(); break;
      default: used = false;
    }
    if (used) { e.preventDefault(); invalidate(); }
  });

  return {
    renderer, scene, camera, controls,
    setRoom(r) {
      if (room) scene.remove(room.root);
      room = r; scene.add(r.root);
      const { pos, target } = viewVectors(r.views.home);
      camera.position.copy(pos); controls.target.copy(target); controls.update();
      invalidate();
    },
    flyTo, select, preview, pulse, setEvening, partAt, invalidate,
    setAutoRotate(on) { autoRotate = on; controls.autoRotate = on; invalidate(); },
    get autoRotate() { return autoRotate; },
  };
}
