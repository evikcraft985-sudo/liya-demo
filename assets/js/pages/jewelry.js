import {
  THREE,
  addShadow,
  createRenderLoop,
  createStage,
  makeCylinder,
  setFallback,
  setReady,
} from '../core/stage.js';

const METALS = {
  gold: { color: '#d6aa55', label: 'Жёлтое золото' },
  rose: { color: '#d58f7f', label: 'Розовое золото' },
  white: { color: '#d9dde2', label: 'Белое золото' },
};

const GEMS = {
  diamond: { color: '#d9efff', attenuation: '#d9efff', label: 'Бриллиант' },
  emerald: { color: '#15946c', attenuation: '#0a6e4d', label: 'Изумруд' },
  ruby: { color: '#b62e48', attenuation: '#8f1732', label: 'Рубин' },
  sapphire: { color: '#3159ad', attenuation: '#1c3d88', label: 'Сапфир' },
};

export async function init(viewport) {
  const stage = createStage(viewport, {
    background: '#241b1d',
    cameraPosition: [3.9, 2.75, 5.4],
    target: [0, 1.02, 0],
    fov: 34,
    environmentIntensity: 0.9,
    minDistance: 3.2,
    maxDistance: 10,
    maxPolarAngle: Math.PI * 0.56,
  });
  stage.renderer.toneMappingExposure = 1.08;
  const { scene } = stage;

  const metalMaterial = new THREE.MeshPhysicalMaterial({
    color: METALS.gold.color,
    metalness: 0.96,
    roughness: 0.17,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
  });
  const gemMaterial = new THREE.MeshPhysicalMaterial({
    color: GEMS.diamond.color,
    metalness: 0,
    roughness: 0.045,
    transmission: 0.78,
    thickness: 0.72,
    ior: 2.35,
    transparent: true,
    opacity: 0.96,
    attenuationColor: GEMS.diamond.attenuation,
    attenuationDistance: 1.2,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
  });
  const pedestalMaterial = new THREE.MeshStandardMaterial({ color: '#4b3737', roughness: 0.76 });
  const floorMaterial = new THREE.MeshStandardMaterial({ color: '#241b1d', roughness: 0.92 });

  const floor = makeCylinder(200, 200, 0.1, floorMaterial, 64);
  floor.position.y = -0.31;
  floor.castShadow = false;
  scene.add(floor);
  const pedestal = makeCylinder(1.85, 1.95, 0.28, pedestalMaterial, 96);
  pedestal.position.y = -0.15;
  scene.add(pedestal);

  const ring = new THREE.Group();
  ring.rotation.set(-0.1, -0.35, -0.06);
  scene.add(ring);

  const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.165, 36, 128), metalMaterial);
  band.position.y = 0.99;
  band.castShadow = true;
  band.receiveShadow = true;
  ring.add(band);

  const shoulder = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.075, 20, 64), metalMaterial);
  shoulder.position.set(0, 1.94, 0);
  shoulder.rotation.x = Math.PI / 2;
  shoulder.scale.set(1, 1, 0.65);
  shoulder.castShadow = true;
  ring.add(shoulder);

  const setting = makeCylinder(0.32, 0.27, 0.16, metalMaterial, 40);
  setting.position.set(0, 2.05, 0);
  ring.add(setting);

  for (const [x, z] of [[-0.27, -0.27], [-0.27, 0.27], [0.27, -0.27], [0.27, 0.27]]) {
    const prong = makeCylinder(0.027, 0.035, 0.48, metalMaterial, 12);
    prong.position.set(x, 2.27, z);
    prong.rotation.z = -x * 0.32;
    prong.rotation.x = z * 0.32;
    ring.add(prong);
  }

  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.49, 0), gemMaterial);
  gem.position.set(0, 2.42, 0);
  gem.scale.set(1, 0.82, 1);
  gem.rotation.y = Math.PI / 4;
  gem.castShadow = true;
  ring.add(gem);

  const sparkleMaterial = new THREE.MeshBasicMaterial({
    color: '#fff8df', transparent: true, opacity: 0.85, depthWrite: false,
  });
  const sparkles = [];
  for (const [x, y, z, scale] of [[-0.8, 2.4, 0.2, 0.055], [0.75, 2.1, 0.35, 0.04], [0.25, 3.03, -0.1, 0.045]]) {
    const sparkle = new THREE.Mesh(new THREE.OctahedronGeometry(scale, 0), sparkleMaterial);
    sparkle.position.set(x, y, z);
    sparkle.userData.baseScale = scale;
    ring.add(sparkle);
    sparkles.push(sparkle);
  }

  addShadow(stage, { intensity: 3.2, position: [3.5, 7, 4.5], mapSize: 1024 });
  const rim = new THREE.DirectionalLight('#fff0dc', 1.8);
  rim.position.set(-4, 4, -3);
  scene.add(rim);
  const gemLight = new THREE.PointLight('#fff5df', 12, 8, 2);
  gemLight.position.set(0, 4.2, 2.5);
  scene.add(gemLight);

  const loop = createRenderLoop(stage, (delta, time, motion) => {
    sparkles.forEach((sparkle, index) => {
      const scale = motion ? 0.65 + Math.abs(Math.sin(time * 1.6 + index * 1.8)) * 0.75 : 0.75;
      sparkle.scale.setScalar(scale);
      sparkle.rotation.y += motion ? delta * 0.7 : 0;
    });
    return motion;
  });

  const shell = viewport.closest('[data-scene]');
  const status = shell.querySelector('[data-scene-status]');
  let selectedMetal = 'gold';
  let selectedGem = 'diamond';

  const describe = () => {
    status.textContent = `${METALS[selectedMetal].label}, ${GEMS[selectedGem].label.toLowerCase()}. Поверните кольцо, чтобы рассмотреть детали.`;
  };

  const setMetal = (key) => {
    if (!METALS[key]) return;
    selectedMetal = key;
    metalMaterial.color.set(METALS[key].color);
    shell.querySelectorAll('[data-metal]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.metal === key));
    });
    describe();
    loop.request();
  };

  const setGem = (key) => {
    if (!GEMS[key]) return;
    selectedGem = key;
    gemMaterial.color.set(GEMS[key].color);
    gemMaterial.attenuationColor.set(GEMS[key].attenuation);
    shell.querySelectorAll('[data-gem]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.gem === key));
    });
    describe();
    loop.request();
  };

  shell.querySelectorAll('[data-metal]').forEach((button) => {
    button.addEventListener('click', () => setMetal(button.dataset.metal));
  });
  shell.querySelectorAll('[data-gem]').forEach((button) => {
    button.addEventListener('click', () => setGem(button.dataset.gem));
  });

  shell.querySelector('[data-reset-camera]')?.addEventListener('click', () => {
    stage.camera.position.set(3.9, 2.75, 5.4);
    stage.controls.target.set(0, 1.02, 0);
    stage.controls.update();
    status.textContent = 'Камера снова показывает кольцо крупным планом.';
    loop.request();
  });

  const motionButton = shell.querySelector('[data-motion]');
  const syncMotion = () => {
    motionButton?.setAttribute('aria-pressed', String(loop.motion));
    if (motionButton) motionButton.textContent = loop.motion ? 'Пауза' : 'Включить вращение';
  };
  motionButton?.addEventListener('click', () => {
    loop.setMotion(!loop.motion);
    syncMotion();
  });
  syncMotion();

  viewport.addEventListener('scenecontextlost', () => {
    setFallback(viewport, '3D-контекст потерян. Показана статичная версия концепта.');
  });
  window.addEventListener('pagehide', () => loop.dispose(), { once: true });

  describe();
  stage.renderer.render(scene, stage.camera);
  setReady(viewport, 'Жёлтое золото и бриллиант. Меняйте материалы и вращайте кольцо.');
}
