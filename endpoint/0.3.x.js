
var mongoose = require('mongoose');
var schemas = require('../lib/schemas');
var cache = require('../lib/cache');
var constants = require('../constants');

var Article = mongoose.model('Article', schemas.article);
var User = mongoose.model('User', schemas.user);

var LB = "\n\r";
var INDENT = "  ";
var SPACER = "---------------";
var NUMDEL = '!NUM-';

var linkPattern = /(\[([\w*\ ]+)\ ((https?|ftp|mailto):\/\/[^\s/$.?#].[^\s]*)\])+/gi;
var linkReplacer = function(match, full, text, url, string){
  return '<a href="'+url+'" rel="nofollow">'+text+'</a>';
}

module.exports = {

  register: function(req, res, next, opts) {

    var hash = require('sha256');
    var payload = req.body.split('|');
    var salt = schemas.randomString(32);

    var user = new User({
      username: payload[0].trim(),
      hash: hash(payload[1] + salt),
      salt: salt
    });
    user.save(function (err, user) {
      if (err) console.log('Error: ', err);
      if (user) {
        var response = [""];
        response.push("\033[1A\r");
        response.push("\033[K[" + user.username + "] → registered: "+constants.protocol+'://'+constants.host+"/~"+user.username);
        response.push("\033[K");
        response.push("\033[K\n\n" + constants.licenseline);
        response.push("---");
        response.push(user.token);

        res.send('OK^^^'+response.join(""));
      } else {
        res.send('BAD^^^Try again.');
      }
      opts.callback(req, res, next);
    });


  },

  password: function(req, res, next, opts) {

    var hash = require('sha256');
    var payload = req.body;
    var salt = schemas.randomString(32);

    req.user.hash = hash(payload + salt);
    req.user.salt = salt;
    req.user.token = schemas.randomString(64);

    req.user.save(function(err, saved){
      if(err){
        res.send('BAD^^^Password update failed.');
        opts.callback(req, res, next);
      }

      var response = [""];
      response.push("\033[1A\r");
      response.push("\033[K[" + saved.username + "] → password updated: "+constants.protocol+'://'+constants.host+"/~"+saved.username);
      response.push("\033[K");
      response.push("---");
      response.push(saved.token);

      res.send('OK^^^'+response.join(""));
      opts.callback(req, res, next);

    });

  },

  login: function(req, res, next, opts) {

    var hash = require('sha256');
    var payload = req.body.split('|');

    User.findOne({username:payload[0]}, function (err, user) {
      if (err) console.log('Error: ', err);

      if (user && user.hash == hash(payload[1] + user.salt)) {
        user.token = schemas.randomString(64);
        user.save();

        var response = [""];
        response.push("\033[1A\r");
        response.push("\033[K[" + user.username + "] → login: "+constants.protocol+'://'+constants.host+"/~"+user.username);
        response.push("\033[K");
        response.push("\033[K\n\n" + constants.licenseline);
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

      var Entities = require('html-entities').AllHtmlEntities;
      var entities = new Entities();

      // remove empty lines
      lines = lines.filter(function(s){ return s.trim() != ''; });
      // wrap lines in <p>
      lines = lines.map(function(s){ return "<p>"+s+"</p>"; });
      // rejoin array to string
      payload = lines.join("\n").trim();
      // link processing
      payload = entities.encode(payload);
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
        article.save(function(err, saved){
          if (err) {
            console.log(err);
            res.send("BAD^^^An error occured during saving, try again with `blog recover`");
            next();
          };

          var response = [""];

          response.push("\033[3A\r");
          response.push("\033[K");
          response.push("\033[K[" + req.user.username + "] → saved: "+saved.title+ " ("+saved.num+")");
          response.push("\033[K");

          res.send("OK^^^" + saved._id + '---' + response.join(LB));

          // invalidate cache
          var paths = [
            "/~" + req.user.username,
            "/~" + req.user.username + "/"];
          for (var i in paths) {

            cache.del(paths[i], function(err, num){
              if (err) { console.error(err); }
            });

          }

          req.user.nextNum++;
          req.user.save();

          opts.callback(req, res, next);

        });


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
            article.save(function(err, saved){
              if (err) {
                console.log(err);
                res.send("BAD^^^An error occured during update, try again with `blog recover`");
                next();
              };

              var response = [""];
              response.push("\033[3A\r");
              response.push("\033[K");
              response.push("\033[K[" + req.user.username + "] → updated: "+saved.title+ " ("+saved.num+")");
              response.push("\033[K");

              res.send("OK^^^" + saved._id + '---' + response.join(LB));

              // invalidate cache

              var paths = [
                "/~" + req.user.username,
                "/~" + req.user.username + "/",
                "/~" + req.user.username +"/"+ saved.slug +"-"+  saved._id];
              for (var i in paths) {

                cache.del(paths[i], function(err, num){
                  if (err) { console.error(err); }
                });

              }

              opts.callback(req, res, next);

            });

          } else { // if article doesn't exist
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

  status: function(req, res, next, opts) {
    console.log("--STATUS");

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
        var newStatus = req.body.trim();
        article.status = newStatus;
        if(newStatus == 'published') {
          article.published_ts = Date.now();
        }
        article.save();

        var response = [""];
        response.push("\033[3A\r");
        response.push("\033[K");
        response.push("\033[K[" + req.user.username + "] → status - "+article.status+": "+article.title+ " ("+article.num+")");
        response.push("\033[K" + constants.protocol+'://'+constants.host+"/~" + req.user.username +"/"+ article.slug +"-"+  article._id);
        response.push("\033[K");

        res.send("OK^^^"+response.join(LB));

        // invalidate cache
          var paths = [
            "/~" + req.user.username,
            "/~" + req.user.username + "/",
            "/~" + req.user.username + "/" + article.slug + "-" +  article._id];
          for (var i in paths) {

          cache.del(paths[i], function(err, num){
            if (err) { console.error(err); }
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
        response.push("\033[3A\r");
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
            if (err) { console.error(err); }
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

        output.push("\033[3A\r");
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
        res.send("OK^^^"+output.join(LB));

        opts.callback(req, res, next);
        next();
      }

      if (articles.length == 0) {
        var response = [""];

        response.push("[" + req.user.username + "] → browse:" + payload );
        response.push("No articles found.");

        response.push("");
        res.send("OK^^^"+response.join(LB));
        opts.callback(req, res, next);
      }

    });


  }
}
