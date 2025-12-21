// generateApartmentVariants({ pattern, templates, variants, includeOptional })
// pattern          — JSON патерн (id, allowMirrorX/Z, slots[])
// templates        — словник шаблонів кімнат: id -> { size, doors, type }
// variants         — скільки варіантів спробувати побудувати
// includeOptional  — чи включати optional кімнати
// Повертає масив варіантів: { rooms, mirrorX, mirrorZ }
export function generateApartmentVariants({ pattern, templates, variants = 1, includeOptional = true, gridStep = 1 }) {
  const result = [];
  for (let i = 0; i < variants; i++) {
    const mirrorX = pattern.allowMirrorX ? Math.random() < 0.5 : false;
    const mirrorZ = pattern.allowMirrorZ ? Math.random() < 0.5 : false;
    const placed = new Map(); // slotId -> room
    const rooms = [];

    for (const slot of pattern.slots) {
      if (slot.optional && !includeOptional) continue;
      const pickId = Array.isArray(slot.pick) ? slot.pick[0] : slot.pick;
      const template = templates[pickId];
      if (!template) continue;

      const basePos = applyMirror(slot.pos || { x: 0, z: 0 }, mirrorX, mirrorZ);
      const parent = slot.attachTo ? placed.get(slot.attachTo) : null;

      const placement = placeRoom(template, slot, basePos, parent, placed, gridStep);
      if (!placement) {
        if (!slot.optional) return result;
        continue;
      }

      placed.set(slot.slotId, placement);
      rooms.push(placement);
    }

    result.push({ rooms, mirrorX, mirrorZ });
  }
  return result;
}

// placeRoom(template, slot, basePos, parentRoom, placed)
// template   — шаблон кімнати
// slot       — опис із патерну (slotId, attachTo, rotate, pos, pick)
// basePos    — позиція з патерну (вже після дзеркала)
// parentRoom — розміщена кімната-батько (attachTo), або null
// placed     — Map уже розміщених кімнат (slotId -> room)
// Повертає room {pos, rotate, tpl, ...} або null якщо не влізла
function placeRoom(template, slot, basePos, parentRoom, placed, gridStep) {
  const rotateCandidates = [0, 90, 180, 270];
  let bestRotate = slot.rotate || 0;
  let attachDir = null;
  let childWall = null;
  let parentWall = null;
  let childDoor = null;
  let parentDoor = null;
  if (parentRoom) {
    attachDir = pickAttachDir(basePos, parentRoom.basePos || parentRoom.pos);
    const toParent = dirToParentVector(attachDir);
    let bestDot = -Infinity;
    for (const rotate of rotateCandidates) {
      const norm = doorNormalFacing(template, rotate, toParent);
      if (!norm) continue;
      const len = Math.hypot(norm.x, norm.z) * Math.hypot(toParent.x, toParent.z) || 1;
      const dot = (norm.x * toParent.x + norm.z * toParent.z) / len;
      if (dot > bestDot) {
        bestDot = dot;
        bestRotate = rotate;
      }
    }
  }

  let pos = snapToGrid({ ...basePos }, gridStep);
  if (parentRoom && attachDir) {
    const parentSize = getSizeAfterRotate(parentRoom.tpl, parentRoom.rotate || 0);
    const childSize = getSizeAfterRotate(template, bestRotate);
    const parentCenter = parentRoom.pos;

    if (attachDir === 'E') { childWall = 'W'; parentWall = 'E'; }
    if (attachDir === 'W') { childWall = 'E'; parentWall = 'W'; }
    if (attachDir === 'N') { childWall = 'S'; parentWall = 'N'; }
    if (attachDir === 'S') { childWall = 'N'; parentWall = 'S'; }

    parentDoor = findDoorOnWorldWall(parentRoom.tpl, parentRoom.rotate || 0, parentWall);
    childDoor = findDoorOnWorldWall(template, bestRotate, childWall);

    if (attachDir === 'E' || attachDir === 'W') {
      const parentAxis = parentSize.d;
      const childAxis = childSize.d;
      const parentDoorCenter = getDoorCenterOffset(parentDoor, parentAxis);
      const childDoorCenter = getDoorCenterOffset(childDoor, childAxis);
      const targetZ = parentCenter.z - parentAxis / 2 + parentDoorCenter + childAxis / 2 - childDoorCenter;
      const maxOffset = Math.max(0, parentAxis / 2 - childAxis / 2);
      const clampedZ = clamp(targetZ, parentCenter.z - maxOffset, parentCenter.z + maxOffset);
      pos = {
        x: parentCenter.x + (attachDir === 'E' ? 1 : -1) * (parentSize.w / 2 + childSize.w / 2),
        z: clampedZ
      };
    } else {
      const parentAxis = parentSize.w;
      const childAxis = childSize.w;
      const parentDoorCenter = getDoorCenterOffset(parentDoor, parentAxis);
      const childDoorCenter = getDoorCenterOffset(childDoor, childAxis);
      const targetX = parentCenter.x - parentAxis / 2 + parentDoorCenter + childAxis / 2 - childDoorCenter;
      const maxOffset = Math.max(0, parentAxis / 2 - childAxis / 2);
      const clampedX = clamp(targetX, parentCenter.x - maxOffset, parentCenter.x + maxOffset);
      pos = {
        x: clampedX,
        z: parentCenter.z + (attachDir === 'S' ? 1 : -1) * (parentSize.d / 2 + childSize.d / 2)
      };
    }

    pos = snapToGrid(pos, gridStep);
  }
  let tries = 0;
  const maxTries = 10;
  while (tries < maxTries) {
    const box = makeAABB(template, pos, bestRotate);
    if (!box) return null;
    const overlap = findOverlap(box, placed);
    if (!overlap) {
      return {
        slotId: slot.slotId,
        type: slot.type,
        tplId: template.id,
        tpl: template,
        pos,
        rotate: bestRotate,
        attachTo: slot.attachTo || null,
        attachDir,
        attachWall: childWall,
        parentWall,
        basePos,
        attachDoor: childDoor,
        parentDoor
      };
    }
    // Зсуваємо вздовж осі найбільшого перекриття у протилежний бік, щоб коробки лише торкались.
    const padding = 0.05;
    if (parentRoom && attachDir) {
      const attachAxis = (attachDir === 'E' || attachDir === 'W') ? 'x' : 'z';
      if (attachAxis === 'x') {
        pos = { x: pos.x, z: pos.z + (overlap.penZ + padding) * overlap.dirZ };
      } else {
        pos = { x: pos.x + (overlap.penX + padding) * overlap.dirX, z: pos.z };
      }
    } else if (overlap.penX > overlap.penZ) {
      pos = { x: pos.x + (overlap.penX + padding) * overlap.dirX, z: pos.z };
    } else {
      pos = { x: pos.x, z: pos.z + (overlap.penZ + padding) * overlap.dirZ };
    }
    pos = snapToGrid(pos, gridStep);
    tries++;
  }
  return null;
}

// doorNormalFacing: вибирає нормаль дверей (після rotateDeg), що найбільше дивиться у бік toParent.
function doorNormalFacing(template, rotateDeg, toParent) {
  if (!template.doors || template.doors.length === 0) return null;
  let best = null;
  let bestDot = -Infinity;
  for (const d of template.doors) {
    const local = wallNormal(d.wall);
    const world = rotateVecLeftHanded(local, rotateDeg);
    const len = Math.hypot(world.x, world.z) * Math.hypot(toParent.x, toParent.z) || 1;
    const dot = (world.x * toParent.x + world.z * toParent.z) / len;
    if (dot > bestDot) {
      bestDot = dot;
      best = world;
    }
  }
  return best;
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

// makeAABB: рахує AABB (min/max) з урахуванням swap w/d при 90°
function makeAABB(template, pos, rotateDeg) {
  if (!template || !template.size) return null;
  const normalizedRotate = ((rotateDeg % 180) + 180) % 180;
  const swap = normalizedRotate === 90;
  const w = swap ? template.size.d : template.size.w;
  const d = swap ? template.size.w : template.size.d;
  return {
    minX: pos.x - w / 2,
    maxX: pos.x + w / 2,
    minZ: pos.z - d / 2,
    maxZ: pos.z + d / 2,
    cx: pos.x,
    cz: pos.z,
    template
  };
}

// findOverlap: перевіряє перетин box з уже розміщеними.
function findOverlap(box, placed) {
  for (const other of placed.values()) {
    if (!other || !other.tpl) continue;
    const b2 = makeAABB(other.tpl, other.pos, other.rotate || 0);
    if (!b2) continue;
    const eps = 1e-4;
    const overlapX = box.minX < b2.maxX - eps && box.maxX > b2.minX + eps;
    const overlapZ = box.minZ < b2.maxZ - eps && box.maxZ > b2.minZ + eps;
    if (overlapX && overlapZ) {
      const penX = Math.min(box.maxX - b2.minX, b2.maxX - box.minX);
      const penZ = Math.min(box.maxZ - b2.minZ, b2.maxZ - box.minZ);
      const cx1 = (box.minX + box.maxX) / 2;
      const cz1 = (box.minZ + box.maxZ) / 2;
      const cx2 = (b2.minX + b2.maxX) / 2;
      const cz2 = (b2.minZ + b2.maxZ) / 2;
      return {
        penX,
        penZ,
        dirX: cx1 >= cx2 ? 1 : -1,
        dirZ: cz1 >= cz2 ? 1 : -1
      };
    }
  }
  return null;
}

function applyMirror(pos, mx, mz) {
  return {
    x: mx ? -pos.x : pos.x,
    z: mz ? -pos.z : pos.z
  };
}

function snapToGrid(pos, step) {
  const s = step || 1;
  return {
    x: Math.round(pos.x / s) * s,
    z: Math.round(pos.z / s) * s
  };
}

function getSizeAfterRotate(template, rotateDeg) {
  const normalizedRotate = ((rotateDeg % 180) + 180) % 180;
  const swap = normalizedRotate === 90;
  return {
    w: swap ? template.size.d : template.size.w,
    d: swap ? template.size.w : template.size.d
  };
}

function pickAttachDir(childBasePos, parentBasePos) {
  const dx = childBasePos.x - parentBasePos.x;
  const dz = childBasePos.z - parentBasePos.z;
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx >= 0 ? 'E' : 'W';
  }
  return dz >= 0 ? 'S' : 'N';
}

function dirToParentVector(dir) {
  switch (dir) {
    case 'E': return { x: -1, z: 0 };
    case 'W': return { x: 1, z: 0 };
    case 'N': return { x: 0, z: 1 };
    case 'S': return { x: 0, z: -1 };
    default: return { x: 0, z: 1 };
  }
}

function computePerpOffset(childBasePos, parentBasePos, dir, parentSize, childSize) {
  if (dir === 'E' || dir === 'W') {
    const raw = childBasePos.z - parentBasePos.z;
    const maxOffset = Math.max(0, parentSize.d / 2 - childSize.d / 2);
    return clamp(raw, -maxOffset, maxOffset);
  }
  const raw = childBasePos.x - parentBasePos.x;
  const maxOffset = Math.max(0, parentSize.w / 2 - childSize.w / 2);
  return clamp(raw, -maxOffset, maxOffset);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getDoorCenterOffset(door, axisLen, defaultWidth = 1.0) {
  if (!door) return axisLen / 2;
  const width = door.width ?? defaultWidth;
  return (door.offset ?? 0) + width / 2;
}

function findDoorOnWorldWall(template, rotateDeg, worldWall) {
  if (!template?.doors || !worldWall) return null;
  for (const door of template.doors) {
    const mapped = mapWallByRotate(door.wall, rotateDeg);
    if (mapped === worldWall) return door;
  }
  return null;
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
