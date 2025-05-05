const mysql = require('mysql2/promise');
const config = require('../config.json');

const pool = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: config.mysql_user,
    password: config.mysql_password,
    database: config.mysql_database,
    connectionLimit: 10,
    decimalNumbers: true,
    waitForConnections: true,
    queueLimit: 0
});

const close = async () => {
    await pool.end();
};

module.exports = {
    pool,
    run: async (query, params = []) => {
        return await pool.execute(query, params);
    },
    get: async (query, params = [], columnName) => {
        const [ rows ] = await pool.execute(query, params);
        const row = rows[0];
        if (!row) return null;
        if (columnName) {
            return row[columnName];
        }
        return row;
    },
    all: async (query, params = []) => {
        const [ rows ] = await pool.execute(query, params);
        return rows;
    },
    resolveSQL: (query, params = []) => {
        return mysql.format(query, params);
    },
    close
};

process.on('exit', close);

process.on('SIGINT', async () => {
    await close();
    process.exit();
});

process.on('SIGTERM', async () => {
    await close();
    process.exit();
});