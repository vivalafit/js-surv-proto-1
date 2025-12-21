import { generateApartmentVariants } from './apartment-generator.js';

// buildLayout(scene, shadowGen, opts)
// scene       — Babylon.Scene, у який додаємо все
// shadowGen   — ShadowGenerator для стін/об’єктів
// opts:
//   patternPath   — шлях до JSON патерну (id + slots)
//   layoutScale   — масштаб координат патерну (1 = метри)
//   groundSize    — розмір площини-підлоги
//   gridEnabled   — показувати сітку на підлозі
//   gridStep      — крок сітки (метри)
//   debugBounds   — показувати жовтий wireframe-бокс кімнати
export async function buildLayout(scene, shadowGen, opts = {}) {
  const roomFiles = ['entry', 'corridor', 'bathroom', 'kitchen', 'bedroom', 'livingroom', 'storage', 'balcony'];
  const patternPath = opts.patternPath || '/room-templates/patterns/apt_basic.json';
  const layoutScale = opts.layoutScale || 1;
  const groundSize = opts.groundSize || 80;
  const gridEnabled = opts.gridEnabled ?? true;
  const gridStep = opts.gridStep || 1;
  const debugBounds = opts.debugBounds || false;

  const walls = [];

  const templates = {};
  for (const f of roomFiles) {
    const data = await loadJSON(`/room-templates/rooms/${f}.json`);
    data.forEach(t => { templates[t.id] = t; });
  }
  const pattern = await loadJSON(patternPath);

  // Ground
  const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: groundSize, height: groundSize }, scene);
  ground.position.y = 0;
  ground.material = createGridMaterial(scene, groundSize, gridStep, gridEnabled);
  ground.receiveShadows = true;

  const variants = generateApartmentVariants({
    pattern,
    templates,
    variants: 1,
    includeOptional: true,
    gridStep
  });
  //поки що беремо перший варік який є
  const variant = variants[0] || { rooms: [] };

  const extraDoors = new Map();
  const roomsById = new Map(variant.rooms.map(room => [room.slotId, room]));
  for (const room of variant.rooms) {
    if (!room.attachTo || !room.attachWall || !room.parentWall) continue;
    const parent = roomsById.get(room.attachTo);
    if (!parent) continue;

    const childHasDoor = hasDoorOnWallRotated(room.tpl, room.rotate || 0, room.attachWall);
    const parentHasDoor = hasDoorOnWallRotated(parent.tpl, parent.rotate || 0, room.parentWall);

    if (!childHasDoor) {
      const childDoor = room.attachDoor;
      const childLocalWall = worldWallToLocalWall(room.rotate || 0, room.attachWall);
      const childWidth = childDoor?.width ?? 1.0;
      const childCenter = childDoor
        ? childDoor.offset + childWidth / 2
        : computeCenterOffsetLocal(room.tpl, childLocalWall);
      addExtraDoor(extraDoors, room.slotId, {
        wall: childLocalWall,
        offset: childCenter - childWidth / 2,
        width: childWidth,
        height: childDoor?.height ?? 2.1
      });
    }

    if (!parentHasDoor) {
      const parentDoor = room.parentDoor;
      const parentLocalWall = worldWallToLocalWall(parent.rotate || 0, room.parentWall);
      const parentWidth = parentDoor?.width ?? 1.0;
      const parentCenter = parentDoor
        ? parentDoor.offset + parentWidth / 2
        : computeCenterOffsetLocal(parent.tpl, parentLocalWall);
      addExtraDoor(extraDoors, parent.slotId, {
        wall: parentLocalWall,
        offset: parentCenter - parentWidth / 2,
        width: parentWidth,
        height: parentDoor?.height ?? 2.1
      });
    }
  }

  for (const room of variant.rooms) {
    const pos = {
      x: (room.pos.x || 0) * layoutScale,
      z: (room.pos.z || 0) * layoutScale
    };
    const doors = extraDoors.get(room.slotId);
    addRoomMeshes(scene, shadowGen, walls, room.tpl, pos, room.rotate || 0, room.slotId, debugBounds, doors);
  }

  return { walls, ground };
}

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function colorByType(type) {
  const map = {
    entry: new BABYLON.Color3(0.3, 0.4, 0.6),
    corridor: new BABYLON.Color3(0.35, 0.35, 0.35),
    bathroom: new BABYLON.Color3(0.5, 0.5, 0.6),
    kitchen: new BABYLON.Color3(0.5, 0.4, 0.4),
    bedroom: new BABYLON.Color3(0.4, 0.45, 0.5),
    kidsroom: new BABYLON.Color3(0.45, 0.5, 0.4),
    livingroom: new BABYLON.Color3(0.45, 0.35, 0.35),
    storage: new BABYLON.Color3(0.35, 0.35, 0.3),
    balcony: new BABYLON.Color3(0.4, 0.35, 0.3)
  };
  return map[type] || new BABYLON.Color3(0.5, 0.5, 0.5);
}

function buildWallSegments(len, doors) {
  const segments = [];
  const sorted = [...doors].sort((a, b) => a.offset - b.offset);
  let cursor = 0;
  for (const d of sorted) {
    const start = cursor;
    const end = d.offset;
    if (end - start > 0.05) segments.push({ start, end });
    cursor = d.offset + d.width;
  }
  if (len - cursor > 0.05) segments.push({ start: cursor, end: len });
  return segments;
}

// addRoomMeshes(scene, shadowGen, walls, tpl, pos, rotDeg, name, debugBounds)
// scene       — Babylon.Scene
// shadowGen   — ShadowGenerator, у який додаємо стіни-кастери
// walls       — масив AABB для колізій (controls)
// tpl         — шаблон кімнати (size, doors, type)
// pos         — {x,z} у світових координатах (y=0)
// rotDeg      — обертання кімнати у градусах
// name        — ідентифікатор/slotId для назв мешів
// debugBounds — чи показувати жовтий wireframe куб кімнати
function addRoomMeshes(scene, shadowGen, walls, tpl, pos, rotDeg, name, debugBounds, extraDoors) {
  const rot = BABYLON.Angle.FromDegrees(rotDeg).radians();
  const floor = BABYLON.MeshBuilder.CreateBox(`${name}-floor`, { width: tpl.size.w, height: 0.1, depth: tpl.size.d }, scene);
  floor.position = new BABYLON.Vector3(pos.x, 0, pos.z);
  floor.rotation.y = rot;
  const fmat = new BABYLON.StandardMaterial(`${name}-floor-mat`, scene);
  fmat.diffuseColor = colorByType(tpl.type);
  fmat.specularColor = new BABYLON.Color3(0, 0, 0);
  floor.material = fmat;
  floor.receiveShadows = true;

  const wallT = 0.1;
  const wallInset = wallT / 2;
  const wallH = tpl.size.h;
  const wallRoot = new BABYLON.TransformNode(`${name}-walls-root`, scene);
  wallRoot.position = floor.position.clone();
  wallRoot.rotation.y = rot;

  if (debugBounds) {
    addDebugBounds(scene, wallRoot, tpl.size);
  }

  const wallsSpec = [
    { wall: 'N', len: tpl.size.w, pos: new BABYLON.Vector3(0, wallH / 2, -tpl.size.d / 2 + wallInset), axis: 'x' },
    { wall: 'S', len: tpl.size.w, pos: new BABYLON.Vector3(0, wallH / 2, tpl.size.d / 2 - wallInset), axis: 'x' },
    { wall: 'W', len: tpl.size.d, pos: new BABYLON.Vector3(-tpl.size.w / 2 + wallInset, wallH / 2, 0), axis: 'z' },
    { wall: 'E', len: tpl.size.d, pos: new BABYLON.Vector3(tpl.size.w / 2 - wallInset, wallH / 2, 0), axis: 'z' }
  ];

  for (const spec of wallsSpec) {
    const doors = tpl.doors.filter(d => d.wall === spec.wall);
    if (extraDoors) {
      extraDoors.filter(d => d.wall === spec.wall).forEach(d => doors.push(d));
    }
    const segs = buildWallSegments(spec.len, doors);
    for (const seg of segs) {
      const segLen = seg.end - seg.start;
      const midLocal = -spec.len / 2 + seg.start + segLen / 2;
      let w, d, px, pz;
      if (spec.axis === 'x') {
        w = segLen;
        d = wallT;
        px = midLocal;
        pz = spec.pos.z;
      } else {
        w = wallT;
        d = segLen;
        px = spec.pos.x;
        pz = midLocal;
      }
      const wallMesh = BABYLON.MeshBuilder.CreateBox(`${name}-wall-${spec.wall}-${seg.start.toFixed(2)}`, { width: w, height: wallH, depth: d }, scene);
      wallMesh.position = new BABYLON.Vector3(px, wallH / 2, pz);
      wallMesh.parent = wallRoot;
      wallMesh.material = fmat;
      wallMesh.receiveShadows = true;

      const info = getWallInfo(wallMesh);
      const dup = findDuplicateWall(walls, info);
      if (dup) {
        wallMesh.isVisible = false;
        wallMesh.isPickable = false;
        wallMesh.receiveShadows = false;
        wallMesh.doNotSyncBoundingInfo = true;
        wallMesh.isOccluded = true;
      } else {
        shadowGen.addShadowCaster(wallMesh);
        walls.push(info);
      }
    }
  }

  addLabel(scene, wallRoot, name || tpl.type, wallH);
}

function getWallInfo(mesh) {
  mesh.computeWorldMatrix(true);
  const bb = mesh.getBoundingInfo().boundingBox;
  const center = bb.centerWorld;
  const ext = bb.extendSizeWorld;
  const axis = ext.x >= ext.z ? 'x' : 'z';
  return {
    mesh,
    axis,
    plane: axis === 'x' ? center.z : center.x,
    min: axis === 'x' ? center.x - ext.x : center.z - ext.z,
    max: axis === 'x' ? center.x + ext.x : center.z + ext.z,
    hx: ext.x,
    hy: ext.y,
    hz: ext.z,
    cx: center.x,
    cy: center.y,
    cz: center.z
  };
}

function overlaps(a, b) {
  const overlap = Math.min(a.max, b.max) - Math.max(a.min, b.min);
  const lenA = a.max - a.min;
  const lenB = b.max - b.min;
  const minLen = Math.min(lenA, lenB);
  return overlap > 0.9 * minLen;
}

function findDuplicateWall(existing, candidate) {
  const epsPlane = 0.02;
  for (const w of existing) {
    if (w.axis !== candidate.axis) continue;
    if (Math.abs(w.plane - candidate.plane) > epsPlane) continue;
    if (overlaps(w, candidate)) return w;
  }
  return null;
}

function addLabel(scene, parent, text, wallH) {
  const plane = BABYLON.MeshBuilder.CreatePlane(`${text}-label`, { size: 1.5 }, scene);
  plane.parent = parent;
  plane.position = new BABYLON.Vector3(0, wallH + 0.3, 0);
  plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
  plane.isPickable = false;
  plane.receiveShadows = false;

  const dt = new BABYLON.DynamicTexture(`${text}-dt`, { width: 256, height: 128 }, scene, false);
  dt.hasAlpha = true;
  dt.getContext().font = 'bold 48px Arial';
  dt.drawText(text, null, 90, 'bold 48px Arial', 'white', 'transparent', true);

  const mat = new BABYLON.StandardMaterial(`${text}-label-mat`, scene);
  mat.diffuseTexture = dt;
  mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  plane.material = mat;
  plane.scaling = new BABYLON.Vector3(0.8, 0.4, 1);
}

function addDebugBounds(scene, parent, size) {
  const box = BABYLON.MeshBuilder.CreateBox(`${parent.name}-bounds`, { width: size.w, height: size.h, depth: size.d }, scene);
  box.parent = parent;
  box.position = new BABYLON.Vector3(0, size.h / 2, 0);
  box.isPickable = false;
  box.receiveShadows = false;

  const mat = new BABYLON.StandardMaterial(`${parent.name}-bounds-mat`, scene);
  mat.wireframe = true;
  mat.emissiveColor = new BABYLON.Color3(1, 0.9, 0.1);
  mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
  mat.specularColor = new BABYLON.Color3(0, 0, 0);
  box.material = mat;
}

// createGridMaterial: малює сітку на ground. Якщо gridEnabled=false — просто кольорова підлога.
function createGridMaterial(scene, groundSize, gridStep, gridEnabled) {
  if (!gridEnabled) {
    const m = new BABYLON.StandardMaterial('groundMat', scene);
    m.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.4);
    m.specularColor = new BABYLON.Color3(0, 0, 0);
    return m;
  }
  const texSize = 256;
  const dt = new BABYLON.DynamicTexture('grid-dt', { width: texSize, height: texSize }, scene, true);
  const ctx = dt.getContext();
  // Темний фон для стабільної видимості сітки
  ctx.fillStyle = '#0d111a';
  ctx.fillRect(0, 0, texSize, texSize);
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 2;
  // Вертикальна лінія ліворуч та праворуч (замкнутий тайл)
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, texSize);
  ctx.moveTo(texSize - 1, 0); ctx.lineTo(texSize - 1, texSize);
  // Горизонтальна лінія згори та знизу
  ctx.moveTo(0, 0); ctx.lineTo(texSize, 0);
  ctx.moveTo(0, texSize - 1); ctx.lineTo(texSize, texSize - 1);
  ctx.stroke();
  dt.update();

  const mat = new BABYLON.StandardMaterial('groundGridMat', scene);
  mat.diffuseTexture = dt;
  mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
  mat.specularColor = new BABYLON.Color3(0, 0, 0);
  mat.backFaceCulling = true;
  const tex = mat.diffuseTexture;
  tex.wrapU = BABYLON.Texture.WRAP_ADDRESSINGMODE;
  tex.wrapV = BABYLON.Texture.WRAP_ADDRESSINGMODE;
  tex.anisotropicFilteringLevel = 16;
  tex.updateSamplingMode(BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
  const tiles = groundSize / gridStep;
  tex.uScale = tiles;
  tex.vScale = tiles;
  return mat;
}

function addExtraDoor(map, slotId, door) {
  if (!slotId || !door) return;
  if (!map.has(slotId)) map.set(slotId, []);
  map.get(slotId).push(door);
}

function computeCenterOffsetLocal(tpl, localWall) {
  if (!tpl) return 0;
  if (localWall === 'W' || localWall === 'E') return tpl.size.d / 2;
  return tpl.size.w / 2;
}

function hasDoorOnWallRotated(tpl, rotateDeg, worldWall) {
  if (!tpl?.doors) return false;
  for (const d of tpl.doors) {
    if (mapWallByRotate(d.wall, rotateDeg) === worldWall) return true;
  }
  return false;
}

function mapWallByRotate(localWall, rotateDeg) {
  const n = wallNormal(localWall);
  const world = rotateVecLeftHanded(n, rotateDeg);
  const wx = world.x;
  const wz = world.z;
  if (Math.abs(wx) >= Math.abs(wz)) {
    return wx >= 0 ? 'E' : 'W';
  }
  return wz >= 0 ? 'S' : 'N';
}

function worldWallToLocalWall(rotateDeg, worldWall) {
  const n = wallNormal(worldWall);
  const local = rotateVecLeftHanded(n, -rotateDeg);
  const lx = local.x;
  const lz = local.z;
  if (Math.abs(lx) >= Math.abs(lz)) {
    return lx >= 0 ? 'E' : 'W';
  }
  return lz >= 0 ? 'S' : 'N';
}

function getSizeAfterRotate(tpl, rotateDeg) {
  const normalizedRotate = ((rotateDeg % 180) + 180) % 180;
  const swap = normalizedRotate === 90;
  return {
    w: swap ? tpl.size.d : tpl.size.w,
    d: swap ? tpl.size.w : tpl.size.d
  };
}

function wallNormal(code) {
  switch (code) {
    case 'N': return { x: 0, z: -1 };
    case 'S': return { x: 0, z: 1 };
    case 'W': return { x: -1, z: 0 };
    case 'E': return { x: 1, z: 0 };
    default: return { x: 0, z: 1 };
  }
}

function rotateVecLeftHanded(v, rotateDeg) {
  const angle = ((rotateDeg % 360) + 360) % 360;
  const rad = angle * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: v.x * cos + v.z * sin,
    z: -v.x * sin + v.z * cos
  };
}
