const { app, BrowserWindow, shell, session } = require('electron');

app.whenReady().then(() => {
    const win = new BrowserWindow({
        width: 1350,
        height: 900,
        autoHideMenuBar: true,
        webPreferences: {
            experimentalFeatures: true
        }
    });

    // Override protected folder restrictions
    session.defaultSession.on('file-system-access-restricted', async (event, details, callback) => {
        callback('allow');
    });

    // Override some defaults for popups opened with window.open
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return {
            action: 'allow',
            overrideBrowserWindowOptions: {
                autoHideMenuBar: true
            }
        };
    });

    win.loadURL('https://osudl.org');
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
