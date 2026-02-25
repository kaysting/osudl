const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true, // Hides the default Windows/Linux file menus
        webPreferences: {
            experimentalFeatures: true // Crucial for file system APIs
        }
    });

    win.loadURL('https://new.osudl.org'); // Change to your live URL
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
