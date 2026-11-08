import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export { THREE };

export const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

export function createStage(container, options = {}) {
  const {
    background = '#ffffff',
    cameraPosition = [6, 4, 7],
    target = [0, 0.8, 0],
    fov = 35,
    environmentIntensity = 0.65,
    minDistance = 4,
    maxDistance = 15,
    maxPolarAngle = Math.PI * 0.49,
  } = options;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  camera.position.fromArray(cameraPosition);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.dataset.sceneCanvas = '';
  container.appendChild(renderer.domElement);

  const environmentScene = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(environmentScene, 0.04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = environmentIntensity;
  disposeObject(environmentScene);
  pmrem.dispose();

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.fromArray(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.minDistance = minDistance;
  controls.maxDistance = maxDistance;
  controls.maxPolarAngle = maxPolarAngle;
  controls.autoRotateSpeed = 0.45;
  controls.update();

  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const aspect = width / height;
    renderer.setSize(width, height, false);
    camera.aspect = aspect;
    camera.fov = fov + (aspect < 0.9 ? 7 : aspect < 1.2 ? 3 : 0);
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  return {
    scene,
    camera,
    renderer,
    controls,
    resizeObserver,
    dispose() {
      resizeObserver.disconnect();
      controls.dispose();
      environmentTarget.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export function createRenderLoop(stage, tick) {
  let frameId = 0;
  let previousTime = 0;
  let inView = true;
  let disposed = false;
  let motion = !reducedMotionQuery.matches;

  const request = () => {
    if (!frameId && !disposed && inView && !document.hidden) {
      frameId = requestAnimationFrame(frame);
    }
  };

  const frame = (time) => {
    frameId = 0;
    if (disposed || !inView || document.hidden) return;

    const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 1 / 60;
    previousTime = time;
    const tickActive = tick ? Boolean(tick(delta, time / 1000, motion)) : false;
    const controlsActive = stage.controls.update(delta);
    stage.renderer.render(stage.scene, stage.camera);

    if (tickActive || controlsActive) request();
  };

  const setInView = (value) => {
    inView = value;
    previousTime = 0;
    if (!inView && frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
    if (inView) request();
  };

  const intersectionObserver = new IntersectionObserver(
    ([entry]) => setInView(entry.isIntersecting),
    { rootMargin: '100px' },
  );
  intersectionObserver.observe(stage.renderer.domElement);
  const resizeObserver = new ResizeObserver(request);
  resizeObserver.observe(stage.renderer.domElement);

  const onVisibility = () => {
    previousTime = 0;
    if (document.hidden && frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    } else if (!document.hidden) {
      request();
    }
  };
  const onMotionChange = (event) => setMotion(!event.matches);
  const onContextLost = (event) => {
    event.preventDefault();
    setInView(false);
    stage.renderer.domElement.dispatchEvent(new CustomEvent('scenecontextlost'));
  };

  const setMotion = (value) => {
    motion = value;
    stage.controls.autoRotate = value;
    previousTime = 0;
    request();
  };

  stage.controls.addEventListener('change', request);
  document.addEventListener('visibilitychange', onVisibility);
  reducedMotionQuery.addEventListener('change', onMotionChange);
  stage.renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  setMotion(motion);

  return {
    request,
    setMotion,
    get motion() {
      return motion;
    },
    dispose() {
      disposed = true;
      if (frameId) cancelAnimationFrame(frameId);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      stage.controls.removeEventListener('change', request);
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotionQuery.removeEventListener('change', onMotionChange);
      stage.renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      stage.dispose();
    },
  };
}

export function addShadow(stage, options = {}) {
  const {
    color = '#ffffff',
    intensity = 3,
    position = [4, 7, 4],
    mapSize = 1024,
  } = options;
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.fromArray(position);
  light.castShadow = true;
  light.shadow.mapSize.set(mapSize, mapSize);
  light.shadow.camera.left = -8;
  light.shadow.camera.right = 8;
  light.shadow.camera.top = 8;
  light.shadow.camera.bottom = -8;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = 25;
  light.shadow.bias = -0.0004;
  stage.scene.add(light);
  return light;
}

export function makeBox(width, height, depth, material, radius = 0.035) {
  const geometry = radius > 0
    ? new RoundedBoxGeometry(width, height, depth, 2, radius)
    : new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function makeCylinder(radiusTop, radiusBottom, height, material, segments = 32) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function disposeObject(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.forEach((material) => materials.add(material));
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export function setFallback(container, message) {
  const shell = container.closest('[data-scene]') || container;
  shell.dataset.sceneState = 'fallback';
  const status = shell.querySelector('[data-scene-status]');
  if (status) status.textContent = message;
}

export function setReady(container, message) {
  const shell = container.closest('[data-scene]') || container;
  shell.dataset.sceneState = 'ready';
  const status = shell.querySelector('[data-scene-status]');
  if (status) status.textContent = message;
}
