export function initControls(ctx, canvas) {
  const { engine, scene, camera, aggregates, walkSpeed, flySpeed, walls } = ctx;

  const keys = {};
  const jumpSpeed = 7;
  const groundRayLen = 2.2;
  let prevSpace = false;
  let debugGrounded = false;
  let velY = 0;
  const gravity = -20;
  const eyeHeight = 1.7; // standing eye height
  const crouchHeight = 1.0;
  let currentHeight = eyeHeight;
  const crouchLerp = 10; // how fast we change height (1/s)
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

    // Ground check + jump/gravity
    const groundHit = getGroundHit();
    const grounded = groundHit && (camera.position.y - groundHit.pickedPoint.y) <= eyeHeight + 0.05;
    debugGrounded = grounded;
    const wantJump = keys['Space'] && !prevSpace;
    if (wantJump && grounded) {
      velY = jumpSpeed;
    }
    prevSpace = keys['Space'] || false;

    velY += gravity * dt;
    camera.position.y += velY * dt;

    // Crouch/stand height adjustment (only meaningful when grounded)
    const targetHeight = grounded && keys['ControlLeft'] ? crouchHeight : eyeHeight;
    const lerp = Math.min(1, crouchLerp * dt);
    currentHeight = currentHeight + (targetHeight - currentHeight) * lerp;

    // Snap to ground
    if (grounded && velY < 0) {
      camera.position.y = groundHit.pickedPoint.y + currentHeight;
      velY = 0;
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
  let lastDbg = 0;
  scene.onAfterRenderObservable.add(() => {
    const now = performance.now();
    if (now - lastDbg > 1000) {
      lastDbg = now;
      console.log(`grounded=${debugGrounded} velY=${velY.toFixed(2)} posY=${camera.position.y.toFixed(2)}`);
    }
  });
}
