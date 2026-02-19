const globalWatch = ['lib', 'config', '.env', 'database/db.js', 'database/migrations/*.sql'];
module.exports = {
    apps: [
        {
            name: 'osudl-web',
            script: 'npm',
            args: 'run webserver',
            cwd: './',
            watch: [...globalWatch, 'apps/web/index.js', 'apps/web/routes']
        },
        {
            name: 'osudl-updater',
            script: 'npm',
            args: 'run updater',
            cwd: './',
            watch: [...globalWatch, 'apps/updater']
        }
    ]
};
