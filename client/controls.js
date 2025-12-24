export function initControls(ctx, canvas) {
  const { engine, scene, camera, aggregates, walkSpeed, flySpeed, walls } = ctx;

  const keys = {};
  let flyMode = true;
  let inputEnabled = true;
  let yVel = 0;
  const gravity = -18;
  const jumpSpeed = 6;
  const eyeHeight = 1.7;
  const groundRayLen = 2.2;
  const colliderRadius = 0.35;

  window.addEventListener('keydown', (e) => { keys[e.code] = true; if (['Space', 'ControlLeft'].includes(e.code)) e.preventDefault(); });
  window.addEventListener('keyup',   (e) => { keys[e.code] = false; });

  canvas.addEventListener('click', () => {
    if (!inputEnabled) return;
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  });

  scene.onBeforeRenderObservable.add(() => {
    if (!inputEnabled) return;
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
      } else {
        // Try sliding along walls instead of hard stop.
        const candX = new BABYLON.Vector3(camera.position.x + move.x, camera.position.y, camera.position.z);
        if (!isBlocked(candX)) camera.position.x = candX.x;
        const candZ = new BABYLON.Vector3(camera.position.x, camera.position.y, camera.position.z + move.z);
        if (!isBlocked(candZ)) camera.position.z = candZ.z;
      }
    }

    if (flyMode) {
      if (keys['Space']) camera.position.y += flySpeed * dt;
      if (keys['ControlLeft']) camera.position.y -= flySpeed * dt;
    } else {
      // Grounded/jump logic
      const groundHit = getGroundHit();
      const groundY = groundHit?.pickedPoint?.y ?? -Infinity;
      const grounded = groundHit && camera.position.y <= groundY + eyeHeight + 0.05 && yVel <= 0;
      if (grounded) {
        camera.position.y = groundY + eyeHeight;
        yVel = 0;
      }
      if (keys['Space'] && grounded) yVel = jumpSpeed;
      yVel += gravity * dt;
      camera.position.y += yVel * dt;
      if (grounded && camera.position.y < groundY + eyeHeight) {
        camera.position.y = groundY + eyeHeight;
        yVel = 0;
      }
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    if (!inputEnabled) return;
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
    const hit = scene.pickWithRay(ray, mesh => mesh?.metadata?.isFloor || mesh?.metadata?.isGround || mesh.checkCollisions);
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

  function snapToGround() {
    const hit = getGroundHit();
    if (hit?.pickedPoint) {
      camera.position.y = hit.pickedPoint.y + eyeHeight;
      yVel = 0;
    }
  }

  function setFlyMode(enabled) {
    flyMode = !!enabled;
    if (!flyMode) snapToGround();
  }

  function setInputEnabled(enabled) {
    inputEnabled = !!enabled;
  }

  return { setFlyMode, getFlyMode: () => flyMode, setInputEnabled };
}
