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

    // main screen
    var screen = new blessed.screen({
      autoPadding: true,
      smartCSR: true,
      program: new blessed.program({
        input: stream,
        output: stream
      }),
      terminal: shell.term || 'ansi'
    });
    screen.key(['C-q'], function(){
      stream.write(Array(stream.rows*2).join('\n') + '\r');
      stream.exit(0);
      stream.end();
    });

    screen.title = 'weblog.sh';
    screen.program.attr('invisible', true);

    if (userMeta.next === "nouser") {

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
        label: ' register '+userMeta.username+', set password:',
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
        label: ' enter your public key, leave blank to set later:',
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
          username: userMeta.username,
          hash: hash(savePassword + salt),
          salt: salt,
          publicKey: value
        });
        user.save(function (err, user) {
          if (err) console.log('Error: ', err);
          if (user) {
            stream.write('→ Account created, do not forget your password.\n\r');
            // stream.write('→ You can now ssh in to write in your blog.\n\r');

            if(value.length === 0) {
              stream.write('→ You can set your public key later using:\n\r  ssh '+user.username+'@localhost key $(cat ~/.ssh/id_rsa.pub)\n\r');
            }
            stream.exit(1);
          } else {
            stream.write('→ Account creation failed.\n\r');
          }
          stream.write('\n\r');
          stream.end();
        });

      });

    } // if nouser


    if (userMeta.next === 'auth') {
      console.log('[ok] user logged in, show cms');
      stream.write("EDITOR SOON\n\r");
      stream.exit(0);
      stream.end();
      return;

      screen.title = 'weblog.sh ~' + userMeta.user.username;

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

  }
}
