const mysql = require('mysql');

const pool  = mysql.createPool({
    connectionLimit: 10,
    host: "g8mh6ge01lu2z3n1.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
    user: "vsjn8jg6vrjwbiai",
    password: "rsm5d0rul8het9qa",
    database: "hmidtpukrliddf89"
});

module.exports = pool;