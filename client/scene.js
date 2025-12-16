export async function initScene(canvas, fpsEl) {
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.04, 0.05, 0.08, 1);

  const camera = new BABYLON.UniversalCamera('cam', new BABYLON.Vector3(0, 2, -6), scene);
  camera.minZ = 0.1;
  camera.inertia = 0.05;
  camera.angularSensibility = 2000;
  camera.attachControl(canvas, true);

  const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0.5, 1, 0.2), scene);
  light.intensity = 0.15;

  // Skybox and simple sun
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

  // Volumetric light ("godrays") — keep cheap settings
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

  // Physics + boxes
  const aggregates = new Map();
  const walls = [];
  function addWall(size, position, name = 'wall') {
    const wall = BABYLON.MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, scene);
    wall.position = position.clone();
    const mat = new BABYLON.StandardMaterial(`${name}-mat`, scene);
    mat.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    mat.specularColor = new BABYLON.Color3(0, 0, 0);
    wall.material = mat;
    wall.checkCollisions = true;
    wall.receiveShadows = true;
    // Static physics body so dynamic boxes collide with walls
    if (scene.isPhysicsEnabled()) {
      new BABYLON.PhysicsAggregate(wall, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.8, restitution: 0.1 }, scene);
    }
    shadowGen.addShadowCaster(wall);
    walls.push({
      mesh: wall,
      cx: position.x,
      cy: position.y,
      cz: position.z,
      hx: size.x / 2,
      hy: size.y / 2,
      hz: size.z / 2,
    });
  }

  async function initPhysics() {
    const havok = await HavokPhysics();
    const plugin = new BABYLON.HavokPlugin(true, havok);
    scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), plugin);

    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 50, height: 50 }, scene);
    ground.position.y = 0;
    ground.checkCollisions = true;
    ground.receiveShadows = true;
    new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.1, friction: 0.8 }, scene);

    const colors = [new BABYLON.Color3(0.8, 0.4, 0.4), new BABYLON.Color3(0.4, 0.8, 0.4), new BABYLON.Color3(0.4, 0.4, 0.8)];
    [new BABYLON.Vector3(5, 1, 5), new BABYLON.Vector3(-5, 1, 3), new BABYLON.Vector3(3, 1, -4)].forEach((pos, i) => {
      const box = BABYLON.MeshBuilder.CreateBox(`box${i}`, { size: 1.5 }, scene);
      box.position = pos;
      const mat = new BABYLON.StandardMaterial(`mat${i}`, scene);
      mat.diffuseColor = colors[i % colors.length];
      box.material = mat;
      const agg = new BABYLON.PhysicsAggregate(box, BABYLON.PhysicsShapeType.BOX, { mass: 1, restitution: 0.2, friction: 0.6 }, scene);
      shadowGen.addShadowCaster(box);
      aggregates.set(box, agg);
    });

    // Perimeter walls for room 1 (20x20 centered at 0,0)
    const w1 = 20, d1 = 20, h = 3, t = 0.5;
    addWall(new BABYLON.Vector3(w1, h, t), new BABYLON.Vector3(0, h / 2, -d1 / 2), 'wall-n1');
    addWall(new BABYLON.Vector3(w1, h, t), new BABYLON.Vector3(0, h / 2, d1 / 2), 'wall-s1');
    addWall(new BABYLON.Vector3(t, h, d1), new BABYLON.Vector3(-w1 / 2, h / 2, 0), 'wall-w1');
    // East wall розбиваємо прохід: замість суцільної стіни — два сегменти вище/нижче проходу

    // Second room offset on +x
    const offsetX = w1 + 6;
    const w2 = 20, d2 = 14;
    addWall(new BABYLON.Vector3(w2, h, t), new BABYLON.Vector3(offsetX, h / 2, -d2 / 2), 'wall-n2');
    addWall(new BABYLON.Vector3(w2, h, t), new BABYLON.Vector3(offsetX, h / 2, d2 / 2), 'wall-s2');
    // West/east стіни кімнати 2 також з проходом на захід, без суцільної стіни зліва

    // Connection between rooms: стіна з прорізом ~3m замість суцільних east/west
    const gap = 3;
    const halfGap = gap / 2;
    const connLen = Math.min(d1, d2);
    const segLen = (connLen - gap) / 2;
    const connX = w1 / 2;
    addWall(new BABYLON.Vector3(t, h, segLen), new BABYLON.Vector3(connX, h / 2, -halfGap - segLen / 2), 'wall-conn-top1');
    addWall(new BABYLON.Vector3(t, h, segLen), new BABYLON.Vector3(connX, h / 2, halfGap + segLen / 2), 'wall-conn-bot1');
    const connX2 = offsetX - w2 / 2;
    addWall(new BABYLON.Vector3(t, h, segLen), new BABYLON.Vector3(connX2, h / 2, -halfGap - segLen / 2), 'wall-conn-top2');
    addWall(new BABYLON.Vector3(t, h, segLen), new BABYLON.Vector3(connX2, h / 2, halfGap + segLen / 2), 'wall-conn-bot2');

    // Purple cube in room 2
    const purple = BABYLON.MeshBuilder.CreateBox('purpleBox', { size: 1.5 }, scene);
    purple.position = new BABYLON.Vector3(offsetX, 1, 0);
    const purpleMat = new BABYLON.StandardMaterial('purpleMat', scene);
    purpleMat.diffuseColor = new BABYLON.Color3(0.7, 0.3, 0.8);
    purple.material = purpleMat;
    const aggPurple = new BABYLON.PhysicsAggregate(purple, BABYLON.PhysicsShapeType.BOX, { mass: 1, friction: 0.6, restitution: 0.2 }, scene);
    shadowGen.addShadowCaster(purple);
    aggregates.set(purple, aggPurple);
  }
  initPhysics();

  // Simple boxy gun attached to camera
  function buildGun() {
    const root = new BABYLON.TransformNode('gunRoot', scene);
    const body = BABYLON.MeshBuilder.CreateBox('gunBody', { width: 0.16, height: 0.1, depth: 0.5 }, scene);
    const grip = BABYLON.MeshBuilder.CreateBox('gunGrip', { width: 0.08, height: 0.18, depth: 0.08 }, scene);
    const muzzle = BABYLON.MeshBuilder.CreateBox('gunMuzzle', { width: 0.12, height: 0.08, depth: 0.12 }, scene);
    const mat = new BABYLON.StandardMaterial('gunMat', scene);
    mat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.25);
    [body, grip, muzzle].forEach(m => { m.material = mat; m.parent = root; });
    body.position = new BABYLON.Vector3(0, 0.05, 0);
    grip.position = new BABYLON.Vector3(0, -0.04, -0.15);
    muzzle.position = new BABYLON.Vector3(0, 0.05, 0.25);

    root.parent = camera;
    root.position = new BABYLON.Vector3(0.25, -0.2, 0.6);
    return root;
  }
  buildGun();

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());

  return { engine, scene, camera, aggregates, walkSpeed, flySpeed, walls };
}
