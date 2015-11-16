'use strict';

var buffersEqual = require('buffer-equal-constant-time');
var mongoose = require('mongoose');
var schemas = require('../schemas');
var cache = require('../cache');
var constants = require('../../constants');

var LB = "\n\r";

var linkPattern = /(\[([\w*\ .\-\+\!\@\#\$\%\^\&\*\(\)\{\}\<\>\,\?\/\'\"\;\:\\]+)\ ((https?|ftp|mailto):\/\/[^\s/$.?#].[^\s]*)\])+/gi;
var linkReplacer = function(match, full, text, url, string){
  return '<a href="'+url+'" rel="nofollow">'+text+'</a>';
}

var saveArticle = function(opts, success, fail){

  console.log(' **  saving article');
  var Article = mongoose.model('Article', schemas.article);

  var payload = opts.payload.trim();
  var raw = opts.payload;

  if(opts.payload.length === 0) {
    console.log('Empty');
    fail();
    return;
  }

  var Entities = require('html-entities').AllHtmlEntities;
  var entities = new Entities();

  opts.payload = entities.encode(opts.payload);

  var lines = opts.payload.split("\n\n");
  var title = lines.shift().trim();

  // remove empty lines
  lines = lines.filter(function(s){ return s.trim() != ''; });
  // wrap lines in <p>
  lines = lines.map(function(s){ return "<p>"+s.replace(/\n/gi, '<br>')+"</p>"; });
  // rejoin array to string
  opts.payload = lines.join("\n").trim();
  // link processing
  opts.payload = opts.payload.replace(linkPattern, linkReplacer);

  console.log('saving:', title, opts.status, opts.num);

  var query = {author:opts.user._id, filename: opts.filename};

  Article.findOne(query, function(err, article){
    if (err) {
      console.log('Error: ', err);
      fail();
    }

    if (article) {

      var paths = [
        "/~" + opts.user.username,
        "/~" + opts.user.username + "/",
        "/~" + opts.user.username +"/"+ article.slug +"-"+  article._id];

      article.raw = raw;
      article.title = title;
      article.content = opts.payload;
      article.status = opts.status;
      article.filename = opts.filename;

      if(opts.status == 'published') {
        article.published_ts = Date.now();
      }
      article.save(function(err, saved){
        if (err) {
          console.log(err);
          fail(true);
        };

        // invalidate cache
        for (var i in paths) {
          cache.del(paths[i], function(err, num){
            if (err) { console.error(err); }
          });
        }

        success();

      });

    } else { // if article doesn't exist

      var values = {
        title: title,
        content: opts.payload,
        raw: raw,
        author: opts.user._id,
        filename: opts.filename,
        num: opts.user.nextNum,
        status: opts.status
      };

      if(opts.status == 'published') {
        values.published_ts = Date.now();
      }

      var article = new Article(values);
      article.save(function(err, saved){
        if (err) {
          console.log(err);
          fail(true);
        };

        // invalidate cache
        var paths = [
          "/~" + opts.user.username,
          "/~" + opts.user.username + "/"];
        for (var i in paths) {

          cache.del(paths[i], function(err, num){
            if (err) { console.error(err); }
          });

        }

        opts.user.nextNum++;
        opts.user.save();

        success();

      });
    }

  });

}

module.exports = function(userMeta) {
  return function(accept, reject, info) {

    // DONE
    // key - set public key
    // login - on.auth handles that
    // register - on.session handles that
    // fetch drafts|posts
    // password
    // create/update article, covers push
    // delete article
    // publish/draft article
    // TODO

    var stream = accept();
    if(userMeta.next === 'auth') {
      var command = info.command.split(' ', 1);
      var args = info.command.substring(command[0].length+1).trim();
      console.log(' **  attempts: ' + command);
      console.log(' **  with: '+args);

      if(command[0] === 'key') {
        // save args to logged in user
        if(args.length===0) {
          stream.write('→ You need to provide a key.\n\r');
          stream.end();
          return;
        }
        stream.write('… Saving key to user\n\r');
        userMeta.user.publicKey = args;
        userMeta.user.save(function(err){
          if(err) {
            console.log(err);
            stream.write('→ Key failed to save.\n\r');
          } else {
            stream.write('→ Key saved.\n\r');
            stream.exit(0);
          }
          stream.end();
        });
      } // end of command key
      else if(command[0] === 'fetch') {

        if(args.length===0 && (args==='drafts' || args==='posts') ) {
          stream.write('→ You need to specify the type.\n\r');
          stream.end();
          return;
        }

        var Article = mongoose.model('Article', schemas.article);
        var Table = require('cli-table2');
        var payload = (args === 'posts') ? 'published' : 'draft';

        stream.write('… Fetching articles'+LB);
        Article
        .find({author: userMeta.user._id, status: payload})
        .sort((payload=="draft") ? {modified_ts: -1} : {published_ts: -1})
        .exec(function(err, articles){
          if (err) {
            stream.write('→ Could not fetch articles.'+LB);
            console.log('Error: ', err);
          }

          if (articles.length != 0) {
            var output = [""];
            output.push("[" + userMeta.user.username + "] → browse:" + payload);
            output.push("");

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
            stream.write(output.join(LB));
            stream.exit(0);
            stream.end();

          }

          if (articles.length == 0) {
            var response = [""];
            response.push("[" + userMeta.user.username + "] → browse:" + payload );
            response.push("\n  No articles found.");
            response.push("\n");
            stream.write(response.join(LB));
            stream.exit(0);
            stream.end();
          }

        });
      } // end of command fetch
      else if(command[0] === 'password') {

        if(args.length===0) {
          stream.write('→ You need to specify a password.\n\r');
          stream.end();
          return;
        }

        var hash = require('sha256');
        var payload = args;
        var salt = schemas.randomString(32);

        userMeta.user.hash = hash(payload + salt);
        userMeta.user.salt = salt;
        userMeta.user.token = schemas.randomString(64);

        stream.write('… Saving new password'+LB);
        userMeta.user.save(function(err, saved){
          if(err){
            stream.write('→ Password update failed.'+LB);
          }

          var response = [];
          response.push("→ password for "+saved.username+" updated"+LB);

          stream.write(response.join(LB));
          stream.exit(0);
          stream.end();

        });

      } // end of command password
      else if(command[0]==='scp' && args.indexOf('-t')!==-1) {
        // SCP SINK MODE
        console.log(' **  scp SINK');
        var path = args.substring(args.indexOf('-t ')+3).trim();
        var parts = path.match(/^~?\/?(draft|public|\~)(?:\/(.*))?/i);

        var status = 'draft';
        if((parts && parts[1] === 'draft') || path == '~') status = 'draft';
        if(parts && parts[1] === 'public') status = 'published';

        var filename = (parts && parts[2]) ? parts[2].trim() : '';

        stream.write('\x00', 'binary'); // OK
        console.log(' **  scp OK sent');

        var StringDecoder = require('string_decoder').StringDecoder;
        var buffersEqual = require('buffer-equal-constant-time');
        var dec = new StringDecoder('utf8');

        var head, payload='', last, saved;
        stream.on('data', function(buffer){
          if(head === undefined) {
            console.log(' **  receiving scp head');
            head = dec.write(buffer).split(' ');
            filename = (filename!=='') ? filename : head[2];
            stream.write('\x00', 'binary');
          } else if(buffersEqual(buffer, new Buffer('\x00', 'binary'))) {
            console.log(' ** receiving scp end');
          } else {
            payload += dec.write(buffer);
            stream.write('\x00', 'binary');
            console.log(' **  receiving scp payload', payload.length, head);
          }

          if(payload.length >= parseInt(head[1]) && !saved) {
            saveArticle({
              payload: payload,
              status: status,
              // num: num,
              user: userMeta.user,
              filename: filename.trim()
            }, function(){
              console.log(' **  scp success');
              stream.exit(0);
              stream.end();
            }, function(quiet){
              if(!quiet) stream.write('\x10', 'binary'); // BAD
              console.log(' **  scp failed');
              stream.exit(-1);
              stream.end();
            });
            saved = true;
          }
        });
      }
      else if(command[0]==='scp' && args.indexOf('-f')!==-1) {
        console.log(' **  scp SOURCE');
        var path = args.split(' ').slice(-1).pop().trim();
        var parts = path.match(/^~?\/?(draft|public|~)(?:\/(.*))?/i);

        var status = 'draft';
        if((parts && parts[1] === 'draft') || path == '~') status = 'draft';
        if((parts && parts[1] === 'public') || path == '/') status = 'published';

        var filename = (parts && parts[2]) ? parts[2].trim() : '';

        var Article = mongoose.model('Article', schemas.article);
        var query = {author:userMeta.user._id, filename:filename};

        if(parts && parts[1]!=='~') {
          query.status = status;
        }

        console.log(query);

        Article.findOne(query, function(err, article){
          if (err) console.log('Error: ', err);

          if (article) {

            // console.log(article.raw.length);
            stream.write('C0644 '+(article.raw.length)+' '+article.title);
            stream.write(article.raw);
            stream.write('\x00', 'binary');
            stream.exit(0);
            stream.end();
            console.log(' **  file sent');

          } else {

            stream.exit(-1);
            stream.end();
            console.log(' **  file not sent');

          }
        });

      }
      else if(command[0]==='ls') {

        var path = args.split(' ').slice(-1).pop().trim();
        var parts = path.match(/^~?\/?(draft|public)\//i);

        var Article = mongoose.model('Article', schemas.article);
        var query = {author:userMeta.user._id};

        if(parts && parts[1]==='draft') query.status = 'draft';
        if(parts && parts[1]==='public') query.status = 'published';

        Article.find(query).limit(100).exec(function(err, articles){
          if (err) console.log('Error: ', err);

          if(articles) {
            console.log(articles.length);
            for(var art in articles) {
              if(articles[art].filename!=='')
                stream.write(articles[art].filename+'\n');
            }
            stream.exit(0);
            stream.end();
          } else {
            stream.exit(-1);
            stream.end();
          }
        });



      }
      else if(command[0]==='publish' || command[0]==='unpublish') {

        var Article = mongoose.model('Article', schemas.article);
        var query = {author:userMeta.user._id, filename:args.trim()};
        var statusDict = {'publish': 'published', 'unpublish': 'draft'};
        var newStatus = statusDict[command[0]];

        Article.findOne(query, function(err, article){
          if (err) console.log('Error: ', err);

          if (article) {
            article.status = newStatus;
            if(newStatus == 'published') {
              article.published_ts = Date.now();
            }
            article.save();

            var response = [""];
            response.push("[" + userMeta.user.username + "] → status - "+article.status+": "+article.title+ " ("+article.num+")");
            response.push("" + constants.protocol+'://'+constants.host+"/~" + userMeta.user.username +"/"+ article.slug +"-"+  article._id);
            response.push("");

            stream.write(response.join(LB));

            // invalidate cache
            var paths = [
              "/~" + userMeta.user.username,
              "/~" + userMeta.user.username + "/",
              "/~" + userMeta.user.username + "/" + article.slug + "-" +  article._id];
            for (var i in paths) {
              cache.del(paths[i], function(err, num){
                if (err) { console.error(err); }
              });
            }

            stream.exit(0);
            stream.end();

          } else {

            stream.write('Article does not exist.'+LB);
            stream.exit(-1);
            stream.end();

          }
        });
      }
      else if(command[0]==='rm') {

        var Article = mongoose.model('Article', schemas.article);

        Article.findOne({author:userMeta.user._id, filename:args.trim()}, function(err, article){
          if (err) console.log('Error: ', err);

          if (article) {
            article.remove();

            var response = [""];
            response.push("[" + userMeta.user.username + "] → deleted: "+article.title+ " ("+article.num+")");
            response.push("");

            stream.write(response.join(LB));

            var paths = [
              "/~" + userMeta.user.username,
              "/~" + userMeta.user.username + "/",
              "/~" + userMeta.user.username +"/"+ article.slug +"-"+  article._id];
            for (var i in paths) {

              cache.del(paths[i], function(err, num){
                if (err) { console.error(err); }
              });

            }

            stream.exit(0);
            stream.end();
          } else {

            stream.write('Article does not exist.'+LB);
            stream.exit(-1);
            stream.end();

          }
        });
      }
      else {
        stream.write('→ Unknown command.'+LB);
        stream.end();
      }

    } else { // unauthorized trying to execute a command
      stream.write('→ Command not available for unauthorized user.\n\r');
      stream.end();
    }

  }
}
