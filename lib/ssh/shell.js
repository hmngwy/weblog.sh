'use strict';

var constants = require('../../constants');

function noop(v) {}
//stream, next, user, username
module.exports = function(userMeta, shell) {
  return function(accept, reject) {
    var stream = accept();

    // TODO
    // add more contextual instructions here

    if (userMeta.next === "nouser") {

      stream.write("Register using:\n\r");
      stream.write('\n  ssh '+userMeta.username+'@weblog.sh key $(cat ~/.ssh/id_rsa.pub)\n\n\r');
      stream.exit(0);
      stream.end();
      return;

    } // if nouser

    if (userMeta.next === 'auth') {
      console.log('[ok] user logged in, show cms');
      stream.write("Reset key using:\n\r");
      stream.write('\n  ssh '+userMeta.username+'@weblog.sh key $(cat ~/.ssh/id_rsa.pub)\n\n\r');
      stream.exit(0);
      stream.end();
      return;
    }

  }
}
