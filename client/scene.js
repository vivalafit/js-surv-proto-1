import { buildLayout } from './apartment-layout.js';

export async function initScene(canvas, fpsEl) {
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.04, 0.05, 0.08, 1);

  const camera = new BABYLON.UniversalCamera('cam', new BABYLON.Vector3(0, 2, -6), scene);
  camera.minZ = 0.1;
  camera.inertia = 0.05;
  camera.angularSensibility = 2000;
  camera.attachControl(canvas, true);

  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.5, 1, 0.2), scene);
  hemi.intensity = 0.15;

  const sky = BABYLON.MeshBuilder.CreateBox('sky', { size: 500 }, scene);
  const skyMat = new BABYLON.StandardMaterial('skyMat', scene);
  skyMat.backFaceCulling = false;
  skyMat.diffuseColor = new BABYLON.Color3(0.06, 0.07, 0.1);
  skyMat.emissiveColor = new BABYLON.Color3(0.06, 0.07, 0.1);
  skyMat.specularColor = new BABYLON.Color3(0, 0, 0);
  sky.material = skyMat;
  sky.isPickable = false;

  const sun = BABYLON.MeshBuilder.CreateSphere('sun', { diameter: 8, segments: 8 }, scene);
  sun.position = new BABYLON.Vector3(-20, 18, -30);
  const sunMat = new BABYLON.StandardMaterial('sunMat', scene);
  sunMat.emissiveColor = new BABYLON.Color3(1.0, 0.65, 0.25);
  sunMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
  sunMat.specularColor = new BABYLON.Color3(0, 0, 0);
  sun.material = sunMat;
  sun.isPickable = false;

  const godrays = new BABYLON.VolumetricLightScatteringPostProcess('godrays', 1.0, camera, sun, 50, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false);
  godrays.exposure = 0.15;
  godrays.decay = 0.96;
  godrays.weight = 0.7;
  godrays.density = 0.9;

  const sunDir = sun.position.clone().normalize().scale(-1);
  const dirLight = new BABYLON.DirectionalLight('sunLight', sunDir, scene);
  dirLight.diffuse = new BABYLON.Color3(1.1, 0.75, 0.4);
  dirLight.specular = new BABYLON.Color3(0.6, 0.55, 0.5);
  dirLight.intensity = 0.7;
  dirLight.autoCalcShadowBounds = false;
  dirLight.shadowMinZ = -50;
  dirLight.shadowMaxZ = 150;
  dirLight.shadowFrustumSize = 80;
  const shadowGen = new BABYLON.ShadowGenerator(1024, dirLight);
  shadowGen.forceBackFacesOnly = true;
  shadowGen.useBlurCloseExponentialShadowMap = false;
  shadowGen.usePoissonSampling = false;
  shadowGen.usePercentageCloserFiltering = true;
  shadowGen.filteringQuality = BABYLON.ShadowGenerator.QUALITY_LOW;
  shadowGen.darkness = 0.8;
  shadowGen.bias = 0.002;
  shadowGen.normalBias = 0.02;

  const walkSpeed = 6;
  const flySpeed = 6;

  scene.onAfterRenderObservable.add(() => {
    if (fpsEl) fpsEl.textContent = `FPS: ${engine.getFps().toFixed(0)}`;
  });

  const { walls } = await buildLayout(scene, shadowGen);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());

  return { engine, scene, camera, aggregates: new Map(), walkSpeed, flySpeed, walls };
}
