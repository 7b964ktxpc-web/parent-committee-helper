const serverless = require('serverless-http');
const app = require('../server.js');

module.exports = serverless(app, {
  request: (req) => req,
  response: (res) => res
});