export function initControls(ctx, canvas) {
  const { engine, scene, camera, aggregates, walkSpeed, flySpeed, walls } = ctx;

  const keys = {};
  const flyMode = true;
  const groundRayLen = 2.2;
  const colliderRadius = 0.45;

  window.addEventListener('keydown', (e) => { keys[e.code] = true; if (['Space', 'ControlLeft'].includes(e.code)) e.preventDefault(); });
  window.addEventListener('keyup',   (e) => { keys[e.code] = false; });

  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  });

  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;
    const forward = camera.getDirection(BABYLON.Axis.Z);
    const right   = camera.getDirection(BABYLON.Axis.X);
    forward.y = 0; right.y = 0;
    forward.normalize(); right.normalize();

    let move = new BABYLON.Vector3(0, 0, 0);
    if (keys['KeyW']) move.addInPlace(forward);
    if (keys['KeyS']) move.subtractInPlace(forward);
    if (keys['KeyA']) move.subtractInPlace(right);
    if (keys['KeyD']) move.addInPlace(right);
    if (move.lengthSquared() > 0) {
      move = move.normalize().scale(walkSpeed * dt);
      const candidate = camera.position.add(move);
      if (!isBlocked(candidate)) {
        camera.position.copyFrom(candidate);
      }
    }

    if (flyMode) {
      if (keys['Space']) camera.position.y += flySpeed * dt;
      if (keys['ControlLeft']) camera.position.y -= flySpeed * dt;
    } else {
      // Grounded/jump logic (not used in fly mode)
      const groundHit = getGroundHit();
      const grounded = groundHit && (camera.position.y - groundHit.pickedPoint.y) <= 1.8;
      const wantJump = keys['Space'];
      if (wantJump && grounded) camera.position.y += 0.1;
      if (keys['ControlLeft']) camera.position.y -= flySpeed * dt;
      if (grounded) camera.position.y = Math.max(camera.position.y, groundHit.pickedPoint.y + 1.7);
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const pick = scene.pick(scene.pointerX, scene.pointerY, mesh => aggregates.has(mesh));
    if (pick?.pickedMesh) {
      const agg = aggregates.get(pick.pickedMesh);
      const dir = camera.getDirection(BABYLON.Axis.Z).normalize();
      const point = pick.pickedPoint || pick.pickedMesh.position;
      agg.body.applyImpulse(dir.scale(8), point);
    }
  });

  function getGroundHit() {
    const origin = camera.position;
    const ray = new BABYLON.Ray(origin, new BABYLON.Vector3(0, -1, 0), groundRayLen);
    const hit = scene.pickWithRay(ray, mesh => mesh.checkCollisions);
    return hit?.hit ? hit : null;
  }

  function isBlocked(pos) {
    for (const w of walls || []) {
      const withinY = pos.y <= w.cy + w.hy && pos.y >= w.cy - w.hy - 0.5;
      if (!withinY) continue;
      const dx = Math.abs(pos.x - w.cx);
      const dz = Math.abs(pos.z - w.cz);
      if (dx <= w.hx + colliderRadius && dz <= w.hz + colliderRadius) return true;
    }
    return false;
  }

  // Debug overlay in console every second
  // (disabled for now)
}
