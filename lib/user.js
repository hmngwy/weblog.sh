'use strict';

var mongoose = require('mongoose');
var schemas = require('./schemas');
var constants = require('../constants');
var User = mongoose.model('User', schemas.user);
var hash = require('sha256');

var self = module.exports = {

  isValidKey: function(key) {
    return (key.trim().length!==0);
  },

  isValidUsername: function(username) {
    return /^[a-z0-9]{2,12}$/.test(username);
  },

  isValidPassword: function(password) {
    return (password.length!==0);
  },

  create: function(args){

    if(!self.isValidKey(args.key)) {
      args.onBadKey && args.onBadKey();
      return false;
    }

    if(!self.isValidUsername(args.username)) {
      args.onBadUsername && args.onBadUsername();
      return false;
    }
    User.findOne({username: args.username}, function(err, user){
      if(err) {
        args.onError && args.onError(err);
        return false;
      } else {
        if(!user) {
          var hash = require('sha256');
          var salt = schemas.randomString(32);
          var randPassword = schemas.randomString(8);
          var user = new User({
            username: args.username,
            hash: hash(randPassword + salt),
            salt: salt,
            publicKey: args.key
          });
          user.save(function (err, user) {
            args.onSave && args.onSave();
            if (err) {
              args.onError && args.onError(err);
              return false;
            }
            if (user) {
              args.onSuccess && args.onSuccess(user.username, randPassword);
            } else {
              args.onFail && args.onFail();
            }
          });
        } else {
          args.onUsernameTaken && args.onUsernameTaken();
        }
      }
    });

  },

  // rekey
  rekey: function(args){

    if(!args.user || !args.key) {
      args.onError && args.onError('missing arguments');
      return false;
    }

    if(!self.isValidKey(args.key)) {
      args.onBadKey && args.onBadKey();
      return false;
    }

    args.user.publicKey = args.key;
    args.user.save(function(err, saved){
      if(err) {
        args.onError && args.onError(err);
        return false;
      } else {
        args.onSuccess && args.onSuccess(saved);
      }
    });

  },

  password: function(args){

    if(!args.user) {
      args.onError && args.onError('missing arguments');
      return false;
    }

    if(!self.isValidPassword(args.password)) {
      args.onBadPassword && args.onBadPassword();
      return false;
    }

    var salt = schemas.randomString(32);

    args.user.hash = hash(args.password + salt);
    args.user.salt = salt;
    args.user.token = schemas.randomString(64);

    args.user.save(function(err, saved){
      if(err){
        args.onError && args.onError(err);
        return false;
      } else {
        args.onSuccess && args.onSuccess(saved);
      }
    });

  },
}
