'use strict';

var blessed = require('blessed');
var Server = require('ssh2').Server;

var fs = require('fs');
var crypt = require('crypto');
var inspect = require('util').inspect;
var buffersEqual = require('buffer-equal-constant-time');
var ssh2 = require('ssh2');
var utils = ssh2.utils;

var schemas = require('./schemas');
var mongoose = require('mongoose');

// var Editor = require('editor-widget');

function noop(v) {}

var server = new Server({
  privateKey: fs.readFileSync( (process.env.NODE_ENV === 'development') ? '../tmp/host.key' : '/var/host.key'),
}, function(client) {

  var stream, next, user, username; // this is available to the user only

  client.on('authentication', function(ctx) {
    console.log(' **  authenticating with method', ctx.method);
    if(ctx.method === 'keyboard-interactive') {
      console.log(' **  keyboard-interactive auth is disabled');
      ctx.reject();
    }

    var User = mongoose.model('User', schemas.user);
    User.findOne({username: ctx.username}, function(err, doc){

      if (doc) {

        if (ctx.method === 'publickey'
         && ctx.username!=undefined
         && doc.publicKey
         && doc.publicKey.length !== 0) {
          console.log(' **  trying key auth');

          //load publickey by username
          var publicKey = utils.genPublicKey(utils.parseKey(doc.publicKey));

          var successfulKeyAuth = ctx.key.algo === publicKey.fulltype
            && buffersEqual(ctx.key.data, publicKey.public);

          if (successfulKeyAuth) {
            // user logged in via key, serve interface
            console.log('[ok] key auth');
            next = 'auth';
            user = doc;
            ctx.accept();
          } else {
            console.log('[no] key auth');
            return ctx.reject();
          }

        } else if(ctx.method === 'password' && ctx.username!=undefined) {
          console.log(' **  trying password auth');
          var hash = require('sha256');

          if (doc && doc.hash == hash(ctx.password + doc.salt)) {
            console.log('[ok] key auth');
            next = 'auth';
            user = doc;
            ctx.accept();
          } else {
            console.log('[no] key auth');
            ctx.reject();
          }

        }
        ctx.reject(); // none

      } else { //user not found, ask to register
        console.log(' **  user does not exist, ask to register');
        next = "nouser";
        user = false;
        username = ctx.username;
        ctx.accept();
      }

    });
  });


  client.on('ready', function(ctx) {
    var rows, cols, term;
    client.once('session', function(accept, reject) {

      var session = accept();
      session.once('exec', function(accept, reject, info) {

        var stream = accept();
        if(next === 'auth') {
          var command = info.command.split(' ', 1);
          var args = info.command.substring(command[0].length+1).trim();
          console.log(' **  attempts: ' + command);
          if(command[0] === 'key' && args.length!==0) {
            // save args to logged in user
            stream.write('← Saving key to user…\n\r');
            user.publicKey = args;
            user.save(function(err){
              if(err) {
                console.log(err);
                stream.write('→ Key failed to save.\n\r');
              } else {
                stream.write('→ Key saved.\n\r');
              }

              stream.end();
            });
          }
        } else { // unauthorized trying to execute a command
          stream.write('→ Command not available for unauthorized user.\n\r');
          stream.end();
        }

      });

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
      }).once('shell', function(accept, reject) {
        stream = accept();

        stream.rows = rows || 24;
        stream.columns = cols || 80;
        stream.isTTY = true;
        stream.setRawMode = noop;
        stream.on('error', noop);

        // main screen
        var screen = new blessed.screen({
          autoPadding: true,
          smartCSR: true,
          program: new blessed.program({
            input: stream,
            output: stream
          }),
          terminal: term || 'ansi'
        });
        screen.key(['C-q'], function(){
          stream.write(Array(stream.rows*2).join('\n') + '\r');
          stream.end();
        });

        screen.title = 'weblog.sh';
        screen.program.attr('invisible', true);

        if (next === "nouser") {

          screen.title = 'weblog.sh registration';

          var savePassword;

          var passwordWindow = blessed.box({
            parent: screen,
            border: {
              type: 'bg'
            },
            height: 'shrink',
            width: '100%',
            top: 1,
            left: 0,
            label: ' {blue-fg}register '+username+', set password:{/blue-fg}',
            tags: true,
            keys: true,
            vi: false
          });

          var passwordInput = blessed.textbox({
            parent: passwordWindow,
            top: 0,
            height: 1,
            left: 2,
            width: '100%',
            censor: true,
            inputOnFocus: true
          });

          passwordWindow.append(passwordInput);
          passwordInput.focus();

          passwordInput.on('submit', function(value) {
            passwordInput.clearValue();
            value = value.trim();

            if(value.length === 0) {
              passwordWindow.setLabel('{yellow-fg} password cannot be blank{/yellow-fg}');
              passwordInput.focus();
              screen.render();
              return;
            } else {
              passwordWindow.hide();
              keyWindow.show();
              keyInput.focus();
              screen.render();

              savePassword = value;

              return;
            }
          });

          var keyWindow = blessed.box({
            parent: screen,
            border: {
              type: 'bg'
            },
            height: 'shrink',
            width: '100%',
            top: 1,
            left: 0,
            label: ' {blue-fg}enter your public key, leave blank to set later:{/blue-fg}',
            tags: true,
            keys: true,
            vi: false
          });

          var keyInput = blessed.textbox({
            parent: keyWindow,
            top: 0,
            height: 5,
            left: 2,
            width: '100%',
            // censor: true,
            inputOnFocus: true
          });

          keyWindow.append(keyInput);
          keyWindow.hide();

          keyInput.on('submit', function(value) {
            keyInput.clearValue();
            value = value.trim();

            keyWindow.hide();

            stream.write(Array(stream.rows*2).join('\n') + '\r');

            console.log('save key as: '+ value);

            var hash = require('sha256');
            var salt = schemas.randomString(32);
            var User = mongoose.model('User', schemas.user);

            var user = new User({
              username: username,
              hash: hash(savePassword + salt),
              salt: salt,
              publicKey: value
            });
            user.save(function (err, user) {
              if (err) console.log('Error: ', err);
              if (user) {
                stream.write('→ Account created, do not forget your password.\n\r');
                stream.write('→ You can now ssh in to write in your blog.\n\r');

                if(value.length === 0) {
                  stream.write('→ You can set your public key later using:\n\r  ssh '+username+'@localhost key $(cat ~/.ssh/id_rsa.pub)\n\r');
                }
              } else {
                stream.write('→ Account creation failed.\n\r');
              }
              stream.write('\n\r');
              stream.end();
            });

          });

        } // if nouser


        if (next === 'auth') {
          console.log('[ok] user logged in, show cms');

          screen.title = 'weblog.sh ~' + user.username;

          var browserPane = new blessed.box({
            parent: screen,
            top: 0,
            left: 0,
            width: '30%',
            height: '100%'
          });
          screen.append(browserPane);

          var postMenu = new blessed.listbar({
            parent: browserPane,
            padding: {top:1, bottom:1},
            height: 3,
            top: 0,
            left: 0,
            width: '100%',
            mouse: true,
            style: {
              bg: 'white',
              item: {
                fg: 'black',
                bg: 'white',
                hover: {
                  bg: 'white',
                  fg: 'red'
                },
              },
              selected: {
                fg: 'blue',
                bg: 'white'
              }
            },
            commands:  {
              'Drafts' : function(){
                console.log('drafts opned');
              },
              'Public' : {
                callback: function(){
                  console.log('public opned');
                }
              }
            }

          });

          var inputPane = new blessed.box({
            parent: screen,
            top: 0,
            left: '30%',
            width: '70%',
            height: '100%'
          });
          // var editor = new Editor({
          //   parent: inputPane,
          //   wrap: true,
          //   padding: {
          //     top: 1, bottom: 1,
          //     left: 1, right: 1
          //   },
          //   gutter: {
          //     lineNumberWidth: 0,
          //     width: 0
          //   },
          //   buffer: {
          //     tabSize: 2,
          //     wrap: true
          //   },
          //   top: 0,
          //   left: 0,
          //   width: '100%',
          //   height: '100%',
          //   highlight: false // enabling highights make ssh2 crash
          // });
          screen.append(inputPane);
          //editor.focus();
        }

        screen.key(['C-d'], function(){
          postMenu.selectTab(0);
          console.log('control pressed');
        });
        screen.key(['C-p'], function(){
          postMenu.selectTab(1);
        });
        screen.render();
        // XXX this fake resize event is needed for some terminals in order to
        // have everything display correctly
        screen.program.emit('resize');

      });
    });
  })

});

module.exports = server;

//.listen(3030, function(){
//  console.log('Running.');
//});
