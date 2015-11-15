'use strict';

var ssh2 = require('ssh2');
var utils = ssh2.utils;
var Server = ssh2.Server;
var fs = require('fs');

var LB = "\n\r";

var server = new Server({
  privateKey: fs.readFileSync(
    (process.env.NODE_ENV === 'development') ?
    './tmp/host.key' : '/var/host.key'
  )
}, function(client) {

  var stream, next, user, username; // this is available to the user only
  var userMeta = {
    stream: stream,
    next: next,
    user: user,
    username: username
  }

  client.on('authentication', require('./ssh/auth')(userMeta));

  client.on('ready', function(ctx) {
    var rows, cols, term;
    client.once('session', function(accept, reject) {

      var session = accept();
      session.once('exec', require('./ssh/exec')(userMeta));

      session.once('pty', function(accept, reject, info) {
        rows = info.rows;
        cols = info.cols;
        term = info.term;
        accept && accept();
      }).on('window-change', function(accept, reject, info) {
        rows = info.rows;
        cols = info.cols;
        if (stream) {
          stream.rows = rows;
          stream.columns = cols;
          stream.emit('resize');
        }
        accept && accept();
      }).once('shell', require('./ssh/shell')(userMeta, {rows: rows, cols:cols, term:term }));
    });
  })

});

module.exports = server;
