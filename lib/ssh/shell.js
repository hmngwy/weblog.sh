'use strict';

var blessed = require('blessed');
var schemas = require('../schemas');
var mongoose = require('mongoose');

function noop(v) {}
//stream, next, user, username
module.exports = function(userMeta, shell) {
  return function(accept, reject) {
    var stream = accept();

    stream.rows = shell.rows || 24;
    stream.columns = shell.cols || 80;
    stream.isTTY = true;
    stream.setRawMode = noop;
    stream.on('error', noop);

    var program = new blessed.program({
      input: stream,
      output: stream
    });
    program.key(['C-q','C-c'], function(){
      stream.write(Array(stream.rows*2).join('\n') + '\r');
      stream.exit(0);
      stream.end();
    });

    // main screen
    var screen = new blessed.screen({
      autoPadding: true,
      smartCSR: false,
      program: program,
      terminal: shell.term || 'xterm',
      fullUnicode: true
    });

    screen.title = 'weblog.sh';

    if (userMeta.next === "nouser") {

      screen.title = 'weblog.sh registration';

      var passwordWindow = blessed.box({
        parent: screen,
        border: {
          type: 'bg'
        },
        height: 'shrink',
        width: '100%',
        top: 1,
        left: 0,
        label: ' {black-fg}register '+userMeta.username+', set password:{/black-fg}',
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
          passwordWindow.setLabel(' password cannot be blank');
          passwordInput.focus();
          screen.render();
          return;
        } else {
          passwordWindow.hide();

          stream.write(Array(stream.rows*2).join('\n') + '\r');

          var hash = require('sha256');
          var salt = schemas.randomString(32);
          var User = mongoose.model('User', schemas.user);

          var user = new User({
            username: userMeta.username,
            hash: hash(value + salt),
            salt: salt
          });
          console.log(' **  saving user '+user.username);
          user.save(function (err, user) {
            if (err) console.log('Error: ', err);
            if (user) {
              stream.write('→ Account created, do not forget your password.\n\r');
              // stream.write('→ You can now ssh in to write in your blog.\n\r');
              stream.write('→ You can set your public key later using:\n\r  ssh '+user.username+'@localhost key $(cat ~/.ssh/id_rsa.pub)\n\r');
              stream.exit(1);
            } else {
              stream.write('→ Account creation failed.\n\r');
            }
            stream.write('\n\r');
            stream.end();
          });

          return;
        }
      });

    } // if nouser

    if (userMeta.next === 'auth') {
      console.log('[ok] user logged in, show cms');
      stream.write("EDITOR SOON\n\r");
      stream.exit(0);
      stream.end();
      return;
    }

    screen.render();
    // XXX this fake resize event is needed for some terminals in order to
    // have everything display correctly
    screen.program.emit('resize');

  }
}
