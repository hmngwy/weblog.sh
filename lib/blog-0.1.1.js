var md5 = require('md5');
var mongoose = require('mongoose');
var schemas = require('./schemas');
var constants = require('../constants');
var cache = require('./cache');

var Article = mongoose.model('Article', schemas.article);
var User = mongoose.model('User', schemas.user);

var LB = "\n\r";
var INDENT = "  ";
var SPACER = "---------------";
var NUMDEL = '!NUM-';

var linkPattern = /(\[([\w*\ ]+)\ ((https?|ftp|mailto):\/\/[^\s/$.?#].[^\s]*)\])+/gi;
var linkReplacer = function(match, full, text, url, string){
  return '<a href="'+url+'">'+text+'</a>';
}

module.exports = {
  ver: 'blog-0.1.1',

  register: function(req, res, next, opts) {

    var payload = req.body.split('|');
    var salt = schemas.randomString(32);

    var user = new User({
      username: payload[0].trim(),
      hash: md5(payload[1] + salt),
      salt: salt
    });
    user.save(function (err, user) {
      if (err) console.log('Error: ', err);
      if (user) {
        var response = [""];
        response.push("\033[1A\r");
        response.push("\033[K[" + user.username + "] → registered: "+constants.protocol+'://'+constants.hostname+"/~"+user.username);
        response.push("\033[K");
        response.push("---");
        response.push(user.token);

        res.send('OK^^^'+response.join(""));
      } else {
        res.send('BAD^^^Try again.');
      }
      opts.callback(req, res, next);
    });


  },

  login: function(req, res, next, opts) {

    var payload = req.body.split('|');

    User.findOne({username:payload[0]}, function (err, user) {
      if (err) console.log('Error: ', err);

      if (user && user.hash == md5(payload[1] + user.salt)) {
        user.token = schemas.randomString(64);
        user.save();

        var response = [""];
        response.push("\033[1A\r");
        response.push("\033[K[" + user.username + "] → login: "+constants.protocol+'://'+constants.hostname+"/~"+user.username);
        response.push("\033[K");
        response.push("---");
        response.push(user.token);

        res.send('OK^^^'+response.join(""));
        opts.callback(req, res, next);
      } else {
        res.send('BAD^^^Invalid password.');
        opts.callback(req, res, next);
      }

    });

  },

  save: function(req, res, next, opts) {
    console.log("--UPDATE");

    var payload = req.body.trim();
    var raw = payload;
    var lines = payload.split("\n");
    var title = lines.shift();

    if (title.trim() == '') {
      res.send("BAD^^^" + "Did not save, title missing.");
      next();
    } else {

      // remove empty lines
      lines = lines.filter(function(s){ return s.trim() != ''; });
      // wrap lines in <p>
      lines = lines.map(function(s){ return "<p>"+s+"</p>"; });
      // rejoin array to string
      payload = lines.join("\n").trim();
      // link processing
      payload = payload.replace(linkPattern, linkReplacer);

      if (!req.headers['x-articlenum'] && !req.headers['x-articleid']) {
        var create = true;
      }

      if (create) {

        var article = new Article({
          title: title,
          content: payload,
          raw: raw,
          author: req.user._id,
          num: req.user.nextNum
        });
        article.save();

        req.user.nextNum++;
        req.user.save();

        var response = [""];

        response.push("\033[4A\r");
        response.push("\033[K");
        response.push("\033[K[" + req.user.username + "] → saved: "+article.title+ " ("+article.num+")");
        response.push("\033[K");

        res.send("OK^^^" + response.join(LB));

        // invalidate cache
        var paths = [
          "/~" + req.user.username,
          "/~" + req.user.username + "/"];
        for (var i in paths) {

          cache.del(paths[i], function(err, num){
            if (error) { return helper.handleError(error); }
          });

        }

        opts.callback(req, res, next);

      } else { //update

        var query = {author:req.user._id};

        // query by num if indicated
        if(req.headers['x-articlenum']) {
          query.num = req.headers['x-articlenum'];
        } else if(req.headers['x-articleid']) {
          query._id = req.headers['x-articleid'];
        }

        Article.findOne(query, function(err, article){
          if (err) console.log('Error: ', err);

          if (article) {
            article.raw = raw;
            article.title = title;
            article.content = payload;
            article.save();

            var response = [""];
            response.push("\033[4A\r");
            response.push("\033[K");
            response.push("\033[K[" + req.user.username + "] → updated: "+article.title+ " ("+article.num+")");
            response.push("\033[K");

            res.send("OK^^^" + response.join(LB));

            // invalidate cache

            var paths = [
              "/~" + req.user.username,
              "/~" + req.user.username + "/",
              "/~" + req.user.username +"/"+ article.slug +"-"+  article._id];
            for (var i in paths) {

              cache.del(paths[i], function(err, num){
                if (error) { return helper.handleError(error); }
              });

            }

            opts.callback(req, res, next);
          } else {
            res.send("BAD^^^Article does not exist.");
            opts.callback(req, res, next);
          }

        });
      }

    }


  },

  fetch: function(req, res, next, opts) {
    console.log("--FETCH");

    var payload = req.body.trim();

    // payload = lines.join("\n").trim();

    if (payload !== "LAST") {

      Article.findOne({author:req.user._id, num: payload}, function(err, article){
        if (err) console.log('Error: ', err);

        if (article) {
          res.send(article._id+'^^^'+article.raw);
          opts.callback(req, res, next);
        } else {
          res.send("BAD^^^Article does not exist.");
          opts.callback(req, res, next);
        }

      });

    } else {

      Article.findOne({author:req.user._id})
      .sort({modified_ts: -1})
      .exec(function(err, article){
        if (err) console.log('Error: ', err);

        if (article) {
          res.send(article._id+'^^^'+article.raw);
          opts.callback(req, res, next);
        } else {
          res.send("BAD^^^Article does not exist.");
          opts.callback(req, res, next);
        }

      });
    }

  },

  publish: function(req, res, next, opts) {
    console.log("--PUBLISH");

    var payload = req.body.trim();

    Article.findOne({author:req.user._id, num: payload}, function(err, article){
      if (err) console.log('Error: ', err);

      if (article) {
        article.published_ts = Date.now();
        article.status = 'published';
        article.save();

        var response = [""];
        response.push("\033[4A\r");
        response.push("\033[K");
        response.push("\033[K[" + req.user.username + "] → published: "+article.title+ " ("+article.num+")");
        response.push("\033[K" + constants.protocol+'://'+constants.hostname+"/~" + req.user.username +"/"+ article.slug +"-"+  article._id);
        response.push("\033[K");

        res.send("OK^^^"+response.join(LB));

        // invalidate cache
          var paths = [
            "/~" + req.user.username,
            "/~" + req.user.username + "/",
            "/~" + req.user.username +"/"+ article.slug +"-"+  article._id];
          for (var i in paths) {

          cache.del(paths[i], function(err, num){
            if (error) { return helper.handleError(error); }
          });

        }

        opts.callback(req, res, next);
      } else {

        res.send("BAD^^^Article does not exist.");
        opts.callback(req, res, next);

      }
    });

  },

  unpublish: function(req, res, next, opts) {
    console.log("--UNPUBLISH");

    var payload = req.body.trim();

    Article.findOne({author:req.user._id, num: payload}, function(err, article){
      if (err) console.log('Error: ', err);

      if (article) {
        delete article.published_ts;
        article.status = 'draft';
        article.save();

        var response = [""];
        response.push("\033[4A\r");
        response.push("\033[K");
        response.push("\033[K[" + req.user.username + "] → unpublished: "+article.title+ " ("+article.num+")");
        response.push("\033[K");

        res.send("OK^^^"+response.join(LB));

        var paths = [
          "/~" + req.user.username,
          "/~" + req.user.username + "/",
          "/~" + req.user.username +"/"+ article.slug +"-"+  article._id];
        for (var i in paths) {

          cache.del(paths[i], function(err, num){
            if (error) { return helper.handleError(error); }
          });

        }

        opts.callback(req, res, next);
      } else {

        res.send("BAD^^^Article does not exist.");
        opts.callback(req, res, next);

      }
    });

  },

  delete: function(req, res, next, opts) {
    console.log("--DELETE");

    var payload = req.body.trim();

    Article.findOne({author:req.user._id, num: payload}, function(err, article){
      if (err) console.log('Error: ', err);

      if (article) {
        article.remove();

        var response = [""];
        response.push("\033[4A\r");
        response.push("\033[K");
        response.push("\033[K[" + req.user.username + "] → deleted: "+article.title+ " ("+article.num+")");
        response.push("\033[K");

        res.send("OK^^^"+response.join(LB));

        var paths = [
          "/~" + req.user.username,
          "/~" + req.user.username + "/",
          "/~" + req.user.username +"/"+ article.slug +"-"+  article._id];
        for (var i in paths) {

          cache.del(paths[i], function(err, num){
            if (error) { return helper.handleError(error); }
          });

        }

        opts.callback(req, res, next);
      } else {

        res.send("BAD^^^Article does not exist.");
        opts.callback(req, res, next);

      }
    });

  },

  browse: function(req, res, next, opts) {

    var Table = require('cli-table2');
    var payload = req.body.trim();

    Article
    .find({author: req.user._id, status: payload})
    .sort((payload=="draft") ? {modified_ts: -1} : {published_ts: -1})
    .exec(function(err, articles){
      if (err) console.log('Error: ', err);

      if (articles.length != 0) {
        var output = [""];

        output.push("\033[4A\r");
        output.push("\033[K");
        output.push("\033[K[" + req.user.username + "] → browse:" + payload);
        output.push("\033[K");

        var tableHead = ['num', 'title', 'modified'];

        if (payload == "published") {
          tableHead.push("published");
        }

        var table = new Table({
          head: tableHead,
          chars: { 'top': '' , 'top-mid': '' , 'top-left': '' , 'top-right': ''
                 , 'bottom': '' , 'bottom-mid': '' , 'bottom-left': '' , 'bottom-right': ''
                 , 'left': '' , 'left-mid': '' , 'mid': '' , 'mid-mid': ''
                 , 'right': '' , 'right-mid': '' , 'middle': ' ' },
          style: { 'padding-left': 2, 'padding-right': 2 }
        });

        for (var i in articles) {

          var row = [
            articles[i].num,
            articles[i].title,
            articles[i].modified_ts.toLocaleDateString('en-GB', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minutes: 'numeric', seconds: 'numeric' })
          ];

          if (payload == "published") {
            row.push(((articles[i].published_ts) ? (articles[i].published_ts.toLocaleDateString('en-GB', { year: 'numeric', month: 'numeric', day: 'numeric' })) : ''));
          }
          table.push(row);
        }

        output.push(table.toString());

        output.push("");
        res.send(output.join(LB));

        opts.callback(req, res, next);
        next();
      }

      if (articles.length == 0) {
        var response = [""];

        response.push("[" + req.user.username + "] → browse:" + payload );
        response.push("No articles found.");

        response.push("");
        res.send(response.join(LB));
        opts.callback(req, res, next);
      }

    });


  }
}
