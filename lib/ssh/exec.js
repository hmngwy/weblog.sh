'use strict';

var buffersEqual = require('buffer-equal-constant-time');
var schemas = require('../schemas');
var mongoose = require('mongoose');
var cache = require('../cache');
var constants = require('../../constants');

var LB = "\n\r";

var linkPattern = /(\[([\w*\ .\-\+\!\@\#\$\%\^\&\*\(\)\{\}\<\>\,\?\/\'\"\;\:\\]+)\ ((https?|ftp|mailto):\/\/[^\s/$.?#].[^\s]*)\])+/gi;
var linkReplacer = function(match, full, text, url, string){
  return '<a href="'+url+'" rel="nofollow">'+text+'</a>';
}

var saveArticle = function(payload, status, num, user, success, fail){

  var Article = mongoose.model('Article', schemas.article);

  var payload = payload.trim();
  var raw = payload;

  if(payload.length === 0) {
    console.log('Empty');
    return;
  }

  var Entities = require('html-entities').AllHtmlEntities;
  var entities = new Entities();

  payload = entities.encode(payload);

  var lines = payload.split("\n\n");
  var title = lines.shift();

  // remove empty lines
  lines = lines.filter(function(s){ return s.trim() != ''; });
  // wrap lines in <p>
  lines = lines.map(function(s){ return "<p>"+s.replace(/\n/gi, '<br>')+"</p>"; });
  // rejoin array to string
  payload = lines.join("\n").trim();
  // link processing
  payload = payload.replace(linkPattern, linkReplacer);

  console.log('saving:', title, status, num);

  if (num === '') {

    var article = new Article({
      title: title,
      content: payload,
      raw: raw,
      author: user._id,
      num: user.nextNum,
      status: status
    });
    article.save(function(err, saved){
      if (err) {
        console.log(err);
        fail();
      };

      // invalidate cache
      var paths = [
        "/~" + user.username,
        "/~" + user.username + "/"];
      for (var i in paths) {

        cache.del(paths[i], function(err, num){
          if (err) { console.error(err); }
        });

      }

      user.nextNum++;
      user.save();

      success();

    });


  } else { //update

    var query = {author:user._id, num: parseInt(num)};

    Article.findOne(query, function(err, article){
      if (err) {
        console.log('Error: ', err);
        fail();
      }

      if (article) {

        var paths = [
          "/~" + user.username,
          "/~" + user.username + "/",
          "/~" + user.username +"/"+ article.slug +"-"+  article._id];

        article.raw = raw;
        article.title = title;
        article.content = payload;
        article.status = status;
        article.save(function(err, saved){
          if (err) {
            console.log(err);
            fail();
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
        console.log('article does not exist'+LB);
        fail();
      }

    });
  }
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
        var path = args.split(' ').slice(-1).pop().trim();

        var status = 'draft';
        if (path === '~' || path === '/') {
          var create = true;
        }

        if(path[0] === '~') status = 'draft';
        if(path[0] === '/') status = 'published';

        if(path.substring(1)==='' || parseInt(path.substring(1)) % 1 === 0) {
          var num = path.substring(1);
          stream.write('\x00', 'binary'); // OK
          console.log(' **  scp OK sent');
        } else {
          stream.write('\x10', 'binary'); // BAD
          stream.exit(0);
          stream.end(); //invalid num
          return;
        }

        var StringDecoder = require('string_decoder').StringDecoder;
        var buffersEqual = require('buffer-equal-constant-time');
        var dec = new StringDecoder('utf8');

        var head, payload='', last;
        stream.on('data', function(buffer){
          if(head === undefined) {
            console.log(' **  receiving scp head');
            head = dec.write(buffer).split(' ');
            stream.write('\x00', 'binary');
          } else if(buffersEqual(buffer, new Buffer('\x00', 'binary'))) {
            console.log(' ** receiving scp end');
          } else {
            payload += dec.write(buffer);
            stream.write('\x00', 'binary');
            console.log(' **  receiving scp payload', payload.length, head);
          }

          if(payload.length >= parseInt(head[1])) {
            saveArticle(payload, status, num, userMeta.user, function(){
              stream.exit(0);
              stream.end();
            }, function(){
              stream.write('\x10', 'binary'); // BAD
              stream.exit(-1);
              stream.end();
            });
          }
        });
      }
      else if(command[0]==='scp' && args.indexOf('-f')!==-1) {
        console.log(' **  scp SOURCE');
        var path = args.split(' ').slice(-1).pop().trim();

        if(['~', '/'].indexOf(path[0]) !== -1) {
          path = path.substring(1);
        }

        if(parseInt(path) % 1 !== 0) {
        stream.write('\x10', 'binary');
        stream.exit(-1);
        stream.end();
          return;
        }

        var Article = mongoose.model('Article', schemas.article);
        var query = {author:userMeta.user._id,num:parseInt(path)};

        Article.findOne(query, function(err, article){
          if (err) console.log('Error: ', err);

          if (article) {

            console.log(article.raw.length);

            stream.write('C0644 '+(article.raw.length+1)+' '+article.title+'\n');
            stream.write(article.raw+'\n');
            stream.write('\x00', 'binary');
            stream.exit(0);
            stream.end();

          } else {

            // stream.write('Article does not exist.'+LB);
            stream.exit(-1);
            stream.end();

          }
        });

      }
      else if(command[0]==='publish' || command[0]==='unpublish') {

        var Article = mongoose.model('Article', schemas.article);
        var query = {author:userMeta.user._id,num:parseInt(args.trim())};
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
      else if(command[0]==='delete') {

        var Article = mongoose.model('Article', schemas.article);

        Article.findOne({author:userMeta.user._id, num: parseInt(args)}, function(err, article){
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
