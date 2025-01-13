const { Pool } = require('pg');

function dbConnect() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        },
    });
    
    pool.connect((err, client, release) => {
        if (err) {
            return console.error("Error acquiring client", err.stack);
        }
        client.query('SELECT NOW()', (err, result) => {
            release();
            if (err) {
                return console.error("Error executing query", err.stack);
            }
            console.log(`Database Time`, result.rows);
        })
    })
}

module.exports = dbConnect;