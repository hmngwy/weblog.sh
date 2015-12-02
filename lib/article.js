'use strict';

var mongoose = require('mongoose');
var schemas = require('./schemas');
var constants = require('../constants');
var Article = mongoose.model('Article', schemas.article);
var parseFile = require('./file').parse;
var cache = require('./cache');

var self = module.exports = {

  save: function(args){
    console.log(' **  saving article');
    var Article = mongoose.model('Article', schemas.article);
    var query = {author:args.user._id, filename: args.filename};

    Article.findOne(query, function(err, article){
      if (err) {
        console.log('Error: ', err);
        args.onFail && args.onFail();
        return;
      }

      if (article) { // update

        var paths = [
          "/~" + args.user.username,
          "/~" + args.user.username + "/",
          "/~" + args.user.username +"/"+ article.slug +"-"+  article._id];

        article.raw = args.payload;

        var processed = parseFile(args.filename, args.payload);

        if(processed === false) {
          args.onFail && args.onFail();
          return;
        }

        article.title = processed.title;
        article.content = processed.payload;
        article.filename = args.filename;

        if(args.status == 'published') {
          article.published_ts = Date.now();
        }

        article.save(function(err, saved){
          if (err) {
            console.log(err);
            args.onFail && args.onFail(true);
            return;
          };

          // invalidate cache
          cache.delAll(paths);

          console.log('deleting', paths);

          args.onSuccess && args.onSuccess();

        }); // end update

      } else { // if article doesn't exist, create

        var file = require('./file').parse;
        var processed = parseFile(args.filename, args.payload);

        if(processed === false) {
          args.onFail && args.onFail();
          return;
        }

        var values = {
          title: processed.title,
          content: processed.payload,
          raw: args.payload,
          author: args.user._id,
          filename: args.filename,
          num: args.user.nextNum,
          status: args.status
        };

        if(args.status == 'published') {
          values.published_ts = Date.now();
        }

        var article = new Article(values);
        article.save(function(err, saved){
          if (err) {
            console.log(err);
            args.onFail && args.onFail(true);
            return;
          };

          // invalidate cache
          cache.delAll([
            "/~" + args.user.username,
            "/~" + args.user.username + "/"]);

          args.user.nextNum++;
          args.user.save();

          args.onSuccess && args.onSuccess();

        }); // end create new
      }

    });
  },

  get: function(args){
    Article.findOne(args.query, function(err, article){
      if (err) {
        console.log('Error: ', err);
        args.onError && args.onError(err);
        return;
      }
      if (article) {
        args.onFound && args.onFound(article);
      } else {
        args.onNotFound && args.onNotFound();
      }
    });
  },


  list: function(args){
    Article.find(args.query).limit(args.limit).exec(function(err, articles){
      if (err) {
        console.log('Error: ', err);
        args.onError && args.onError(err);
        return;
      }
      if(articles) {
        args.onFound && args.onFound(articles);
      } else {
        args.onNoneFound && args.onNoneFound();
      }
    });
  },

  status: function(args){
    Article.findOne(args.query, function(err, article){
      if (err) {
        console.log('Error: ', err);
        args.onError && args.onError(err);
        return;
      }
      if (article) {
        article.status = args.status;
        if(args.status == 'published') {
          article.published_ts = Date.now();
        }
        article.save(function(err, saved){
          if (err) {
            console.log('Error: ', err);
            args.onError && args.onError(err);
            return;
          }
          cache.delAll([
            "/~" + args.user.username,
            "/~" + args.user.username + "/",
            "/~" + args.user.username + "/" + saved.slug + "-" +  saved._id]);
          args.onSuccess && args.onSuccess(saved);
        });
      } else {
        args.onNotFound && args.onNotFound();
      }
    });
  },

  delete: function(args){

    Article.findOne({author:args.user._id, filename:args.filename}, function(err, article){
      if (err) {
        console.log('Error: ', err);
        args.onError && args.onError(err);
        return;
      }
      if (article) {
        article.remove(function(err, removed){
          if (err) {
            console.log('Error: ', err);
            args.onError && args.onError(err);
            return;
          }
          cache.delAll([
            "/~" + args.user.username,
            "/~" + args.user.username + "/",
            "/~" + args.user.username +"/"+ article.slug +"-"+  article._id]);
          args.onSuccess && args.onSuccess(removed);
        });
      } else {
        args.onNotFound && args.onNotFound();
      }
    });
  }

}
