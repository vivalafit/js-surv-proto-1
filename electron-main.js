const path = require('path');
const { app, BrowserWindow, Menu, globalShortcut } = require('electron');
const { spawn } = require('child_process');

let serverProc = null;

function startServer() {
  // Run the Node server with system Node (uWS prebuilt ABI)
  serverProc = spawn('node', [path.join(__dirname, 'server', 'index.js')], {
    cwd: __dirname,
    stdio: 'inherit',
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL('http://localhost:3000');
  attachHotkeyBlock(win);
}

function attachHotkeyBlock(win) {
  // Відрубаємо типові браузерні шорткати (reload, devtools, close tab, new window, etc.).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    if (
      ctrl && (
        ['W', 'R', 'N', 'T'].includes(input.key) || // закриття, reload, new window/tab
        (input.shift && input.key === 'I')
      )
    ) {
      event.preventDefault();
    }
    if (['F5', 'F11'].includes(input.code)) {
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  // Remove default menu to avoid accelerators like Ctrl+W from the menu layer.
  Menu.setApplicationMenu(null);
  // Прибираємо глобальні гарячі, якщо були зареєстровані.
  globalShortcut.unregisterAll();

  startServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProc) serverProc.kill();
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
