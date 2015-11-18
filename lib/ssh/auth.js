'use strict';

var buffersEqual = require('buffer-equal-constant-time');
var utils = require('ssh2').utils;
var schemas = require('../schemas');
var mongoose = require('mongoose');

module.exports = function(userMeta) {
  return function(ctx) {

    console.log(' **  '+ctx.username+' initiated');
    if(ctx.username === undefined) {
      console.log(' **  rejecting nameless login', ctx.method);
      ctx.reject();
      return;
    }

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
          if(doc.publicKey && doc.publicKey.length) {

            var publicKey = utils.genPublicKey(utils.parseKey(doc.publicKey));

            var successfulKeyAuth = ctx.key.algo === publicKey.fulltype
              && buffersEqual(ctx.key.data, publicKey.public);

            if (successfulKeyAuth) {
              // user logged in via key, serve interface
              console.log('[ok] key auth');
              userMeta.next = 'auth';
              userMeta.user = doc;
              ctx.accept();
            } else {
              console.log('[no] key auth');
              return ctx.reject();
            }

          } else {

            console.log('[no] key auth');
            return ctx.reject();

          }

        } else if(ctx.method === 'password') {

          console.log(' **  trying password auth');

          var hash = require('sha256');

          // console.log(' REMOVE ME ', ctx.password, hash(ctx.password + doc.salt), doc.hash);

          if (doc && doc.hash == hash(ctx.password + doc.salt)) {
            console.log('[ok] pass auth');
            userMeta.next = 'auth';
            userMeta.user = doc;
            ctx.accept();
          } else {
            console.log('[no] pass auth');
            ctx.reject();
          }

        }
        ctx.reject(); // none

      } else { //user not found, forward to shell for registration
        console.log(' **  user does not exist, ask to register');
        userMeta.next = "nouser";
        userMeta.user = false;
        userMeta.username = ctx.username;
        ctx.accept();
      }

    });
  }
}
