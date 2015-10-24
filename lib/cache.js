if (process.env.NODE_ENV==='development' || process.env.CACHING !== 'ON') {
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

  cache.on('connected', function () {
    console.log("erc connected");
  });

  cache.on('message', function (message) {
    console.log("erc: "+message);
  });

  cache.on('disconnected', function () {
    console.log("erc disconnected");
  });
}

module.exports = cache;
