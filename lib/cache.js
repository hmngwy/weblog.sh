if (process.env.NODE_ENV==='development' || process.env.CACHING === 'OFF') {
  var cache = {
    route: function(){
      return function(req, res, next) { next(); }
    },
    del: function(str, func) {}
  }
} else {
  var cache = require('express-redis-cache')({
    host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379,
    expire: 60 * 60 // 1 hour
  });
}

module.exports = cache;
