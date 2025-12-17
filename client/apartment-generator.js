// Простий генератор розкладок: бере патерн і шаблони кімнат,
// повертає масив варіантів із підібраними кімнатами та позиціями.
export function generateApartmentVariants({ pattern, templates, variants = 1, includeOptional = true }) {
  const result = [];
  for (let i = 0; i < variants; i++) {
    const mirrorX = pattern.allowMirrorX ? Math.random() < 0.5 : false;
    const mirrorZ = pattern.allowMirrorZ ? Math.random() < 0.5 : false;
    const rooms = [];
    for (const slot of pattern.slots) {
      if (slot.optional && !includeOptional) continue;
      const pickId = Array.isArray(slot.pick) ? slot.pick[0] : slot.pick;
      const tpl = templates[pickId];
      if (!tpl) continue;
      const pos = applyMirror(slot.pos || { x: 0, z: 0 }, mirrorX, mirrorZ);
      const rot = slot.rot || 0;
      rooms.push({
        slotId: slot.slotId,
        type: slot.type,
        tplId: tpl.id,
        tpl,
        pos,
        rot,
        attachTo: slot.attachTo || null
      });
    }
    result.push({ rooms, mirrorX, mirrorZ });
  }
  return result;
}

function applyMirror(pos, mx, mz) {
  return {
    x: mx ? -pos.x : pos.x,
    z: mz ? -pos.z : pos.z
  };
}
