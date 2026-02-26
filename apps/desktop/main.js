const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
    const win = new BrowserWindow({
        width: 1350,
        height: 900,
        autoHideMenuBar: true,
        webPreferences: {
            experimentalFeatures: true
        }
    });

    // Override some defaults for popups opened with window.open
    win.webContents.setWindowOpenHandler(() => {
        return {
            action: 'allow',
            overrideBrowserWindowOptions: {
                autoHideMenuBar: true
            }
        };
    });

    win.loadURL('https://new.osudl.org');
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
