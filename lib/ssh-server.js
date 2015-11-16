'use strict';

var ssh2 = require('ssh2');
var utils = ssh2.utils;
var Server = ssh2.Server;
var fs = require('fs');

var LB = "\n\r";

/*
# register
$ ssh edward@weblog.sh

# browse drafts
$ ssh edward@weblog.sh fetch draft

# browse published
$ ssh edward@weblog.sh fetch published

# create new and upload on save
$ vim scp://edward@weblog.sh/~

# edit existing and upload on save
$ vim scp://edward@weblog.sh/~10

# upload draft from file
$ scp article.txt edward@weblog.sh:~

# upload public from file
$ scp article.txt edward@weblog.sh:/

# download article
$ scp edward@weblog.sh:~10 article.txt

# overwrite article
$ scp article.txt edward@weblog.sh:~10

# publish existing article
$ ssh edward@weblog.sh publish 10
$ ssh edward@weblog.sh unpublish 10
*/

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
