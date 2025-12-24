export function initEditor(ctx, layout) {
  const { scene } = ctx;
  let enabled = false;
  let doorMode = false;
  let selectedId = null;
  const outlineColor = new BABYLON.Color3(0.2, 1, 0.2);

  scene.onPointerObservable.add((pointerInfo) => {
    if (!enabled) return;
    if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERDOWN) return;
    const evt = pointerInfo.event;
    if (evt.button !== 0) return;
    const pick = scene.pick(scene.pointerX, scene.pointerY, (mesh) => {
      return !!mesh?.metadata?.roomId;
    });
    if (!pick?.pickedMesh) return;

    if (doorMode && pick.pickedMesh.metadata?.wall) {
      const wallMesh = pick.pickedMesh;
      const worldPoint = pick.pickedPoint || wallMesh.getAbsolutePosition();
      placeDoor(layout, wallMesh, worldPoint);
      return;
    }

    selectRoom(pick.pickedMesh.metadata.roomId);
  });

  window.addEventListener('keydown', (e) => {
    if (!enabled) return;
    if (e.code === 'Escape') {
      doorMode = false;
      selectRoom(null);
      return;
    }
    if (e.code === 'KeyT') {
      doorMode = !doorMode;
      return;
    }
    if (!selectedId || doorMode) return;

    const room = layout.roomsById.get(selectedId);
    if (!room) return;
    const step = layout.gridStep / (layout.layoutScale || 1);
    let moved = false;
    let dx = 0;
    let dz = 0;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { dz -= step; moved = true; }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { dz += step; moved = true; }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { dx -= step; moved = true; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { dx += step; moved = true; }
    if (e.code === 'KeyQ') { room.rotate = ((room.rotate || 0) - 90 + 360) % 360; moved = true; }
    if (e.code === 'KeyE') { room.rotate = ((room.rotate || 0) + 90) % 360; moved = true; }

    if (moved) {
      room.pos = {
        x: (room.pos?.x || 0) + dx,
        z: (room.pos?.z || 0) + dz
      };
      layout.rebuild();
      selectRoom(selectedId);
      e.preventDefault();
    }
  });

  function selectRoom(roomId) {
    if (selectedId) {
      const prev = layout.roomsById.get(selectedId);
      if (prev) setOutline(prev.meshes, false);
    }
    selectedId = roomId;
    if (selectedId) {
      const next = layout.roomsById.get(selectedId);
      if (next) setOutline(next.meshes, true);
    }
  }

  function setOutline(meshes, enabledFlag) {
    for (const mesh of meshes || []) {
      mesh.renderOutline = enabledFlag;
      mesh.outlineColor = outlineColor;
      mesh.outlineWidth = 0.05;
    }
  }

  function placeDoor(layoutRef, wallMesh, worldPoint) {
    const roomId = wallMesh.metadata?.roomId;
    const wall = wallMesh.metadata?.wall;
    const room = layoutRef.roomsById.get(roomId);
    if (!room || !wall || !room.root) return;

    const neighborWall = findAdjacentWall(layoutRef, wallMesh);
    const doorWidth = layoutRef.gridStep;

    addDoorToRoom(room, wall, worldPoint, doorWidth, layoutRef);
    if (neighborWall) {
      const neighborId = neighborWall.metadata?.roomId;
      const neighborRoom = layoutRef.roomsById.get(neighborId);
      if (neighborRoom) addDoorToRoom(neighborRoom, neighborWall.metadata?.wall, worldPoint, doorWidth, layoutRef);
    }

    layoutRef.rebuild();
    selectRoom(roomId);
  }

  function addDoorToRoom(room, wall, worldPoint, doorWidth, layoutRef) {
    if (!room.root) return;
    const inv = room.root.getWorldMatrix().clone().invert();
    const local = BABYLON.Vector3.TransformCoordinates(worldPoint, inv);
    const len = (wall === 'N' || wall === 'S') ? room.tpl.size.w : room.tpl.size.d;
    if (len <= doorWidth) return;
    const axis = (wall === 'N' || wall === 'S') ? local.x : local.z;
    let center = axis + len / 2;
    center = Math.round(center / layoutRef.gridStep) * layoutRef.gridStep;
    let offset = center - doorWidth / 2;
    offset = clamp(offset, 0, len - doorWidth);

    const height = 2.1;
    if (!room.userDoors) room.userDoors = [];
    if (hasDoor(room, wall, offset, doorWidth)) return;
    room.userDoors.push({ wall, offset, width: doorWidth, height });
  }

  function hasDoor(room, wall, offset, width) {
    const target = offset + width / 2;
    const lists = [room.tpl?.doors || [], room.userDoors || []];
    for (const list of lists) {
      for (const d of list) {
        if (d.wall !== wall) continue;
        const w = d.width ?? width;
        const center = (d.offset ?? 0) + w / 2;
        if (Math.abs(center - target) <= 0.05) return true;
      }
    }
    return false;
  }

  function findAdjacentWall(layoutRef, source) {
    const info = getWallInfo(source);
    const epsPlane = 0.02;
    for (const other of layoutRef.wallMeshes || []) {
      if (other === source) continue;
      if (other.metadata?.roomId === source.metadata?.roomId) continue;
      const info2 = getWallInfo(other);
      if (info.axis !== info2.axis) continue;
      if (Math.abs(info.plane - info2.plane) > epsPlane) continue;
      if (overlaps(info, info2)) return other;
    }
    return null;
  }

  function getWallInfo(mesh) {
    mesh.computeWorldMatrix(true);
    const bb = mesh.getBoundingInfo().boundingBox;
    const center = bb.centerWorld;
    const ext = bb.extendSizeWorld;
    const axis = ext.x >= ext.z ? 'x' : 'z';
    return {
      axis,
      plane: axis === 'x' ? center.z : center.x,
      min: axis === 'x' ? center.x - ext.x : center.z - ext.z,
      max: axis === 'x' ? center.x + ext.x : center.z + ext.z
    };
  }

  function overlaps(a, b) {
    const overlap = Math.min(a.max, b.max) - Math.max(a.min, b.min);
    const lenA = a.max - a.min;
    const lenB = b.max - b.min;
    if (Math.abs(lenA - lenB) > 0.02) return false;
    const minLen = Math.min(lenA, lenB);
    return overlap >= minLen - 0.02;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function setEnabled(isEnabled) {
    enabled = !!isEnabled;
    if (!enabled) {
      doorMode = false;
      selectRoom(null);
    }
  }

  return {
    setEnabled,
    isEnabled: () => enabled,
    toggleDoorMode: () => { doorMode = !doorMode; return doorMode; },
    isDoorMode: () => doorMode,
    getSelectedId: () => selectedId
  };
}
