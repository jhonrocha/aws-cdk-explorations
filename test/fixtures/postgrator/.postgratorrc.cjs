const path = require('path')
require('dotenv').config()

module.exports = {
  migrationPattern: path.join(__dirname, "migrations/*"),
  driver: "pg",
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: "postgres",
  username: process.env.PG_USERNAME,
  password: process.env.PG_PASSWORD,
}
