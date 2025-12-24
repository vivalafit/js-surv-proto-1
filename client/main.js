import { initNet } from './net.js';
import { initScene } from './scene.js';
import { initControls } from './controls.js';
import { initEditor } from './editor.js';

(async function main() {
  const parts = location.pathname.split('/').filter(Boolean);
  const roomId = parts[1];
  initNet(roomId);

  const canvas = document.getElementById('renderCanvas');
  const fpsEl = document.getElementById('fps');
  const sceneCtx = await initScene(canvas, fpsEl);

  const controls = initControls(sceneCtx, canvas);
  const editor = sceneCtx.layout ? initEditor(sceneCtx, sceneCtx.layout) : null;
  const modeBtn = document.getElementById('modeToggle');
  if (modeBtn && controls?.setFlyMode) {
    const modes = ['Fly', 'FPS', 'Edit'];
    let modeIndex = 0;
    const updateLabel = () => {
      const mode = modes[modeIndex];
      const doorTag = editor?.isDoorMode?.() ? ' (Door)' : '';
      modeBtn.textContent = `Mode: ${mode}${doorTag}`;
    };
    const applyMode = () => {
      const mode = modes[modeIndex];
      if (mode === 'Fly') {
        controls.setInputEnabled(true);
        controls.setFlyMode(true);
        editor?.setEnabled(false);
      } else if (mode === 'FPS') {
        controls.setInputEnabled(true);
        controls.setFlyMode(false);
        editor?.setEnabled(false);
      } else {
        controls.setInputEnabled(false);
        controls.setFlyMode(true);
        editor?.setEnabled(true);
        document.exitPointerLock?.();
      }
      updateLabel();
    };
    modeBtn.addEventListener('click', () => {
      modeIndex = (modeIndex + 1) % modes.length;
      applyMode();
    });
    window.addEventListener('keydown', (e) => {
      if (modes[modeIndex] === 'Edit' && e.code === 'KeyT') {
        editor?.toggleDoorMode?.();
        updateLabel();
      }
    });
    applyMode();
  }
})();
