const config = require('../config.json');
const cp = require('child_process');

cp.execSync(
    `mysqldump -u "${config.mysql_user}" -p'${config.mysql_password}' --no-data ${config.mysql_database} > schema.sql`,
    { stdio: 'inherit' }
)