import { generateApartmentVariants } from './apartment-generator.js';

export async function buildLayout(scene, shadowGen, opts = {}) {
  const roomFiles = ['entry', 'corridor', 'bathroom', 'kitchen', 'bedroom', 'livingroom', 'storage', 'balcony'];
  const patternPath = opts.patternPath || '/room-templates/patterns/apt_basic.json';
  // layoutScale 1 => координати з патерну вважаємо метрами і не розтягуємо далеко.
  const layoutScale = opts.layoutScale || 1;
  const groundSize = opts.groundSize || 80;

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
  const groundMat = new BABYLON.StandardMaterial('groundMat', scene);
  groundMat.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.4);
  groundMat.specularColor = new BABYLON.Color3(0, 0, 0);
  ground.material = groundMat;
  ground.receiveShadows = true;

  const variants = generateApartmentVariants({
    pattern,
    templates,
    variants: 1,
    includeOptional: true
  });
  //поки що беремо перший варік який є
  const variant = variants[0];

  for (const room of variant.rooms) {
    const pos = {
      x: (room.pos.x || 0) * layoutScale,
      z: (room.pos.z || 0) * layoutScale
    };
    addRoomMeshes(scene, shadowGen, walls, room.tpl, pos, room.rot || 0, room.slotId);
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

function addRoomMeshes(scene, shadowGen, walls, tpl, pos, rotDeg, name) {
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
  const wallH = tpl.size.h;
  const wallRoot = new BABYLON.TransformNode(`${name}-walls-root`, scene);
  wallRoot.position = floor.position.clone();
  wallRoot.rotation.y = rot;

  const wallsSpec = [
    { wall: 'N', len: tpl.size.w, pos: new BABYLON.Vector3(0, wallH / 2, -tpl.size.d / 2), axis: 'x' },
    { wall: 'S', len: tpl.size.w, pos: new BABYLON.Vector3(0, wallH / 2, tpl.size.d / 2), axis: 'x' },
    { wall: 'W', len: tpl.size.d, pos: new BABYLON.Vector3(-tpl.size.w / 2, wallH / 2, 0), axis: 'z' },
    { wall: 'E', len: tpl.size.d, pos: new BABYLON.Vector3(tpl.size.w / 2, wallH / 2, 0), axis: 'z' }
  ];

  for (const spec of wallsSpec) {
    const doors = tpl.doors.filter(d => d.wall === spec.wall);
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
