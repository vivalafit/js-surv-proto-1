import { initNet } from './net.js';
import { initScene } from './scene.js';
import { initControls } from './controls.js';

(async function main() {
  const parts = location.pathname.split('/').filter(Boolean);
  const roomId = parts[1];
  document.getElementById('room').textContent = roomId || '(none)';

  initNet(roomId);

  const canvas = document.getElementById('renderCanvas');
  const fpsEl = document.getElementById('fps');
  const sceneCtx = await initScene(canvas, fpsEl);

  initControls(sceneCtx, canvas);
})();
