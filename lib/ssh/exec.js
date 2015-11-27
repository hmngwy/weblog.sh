'use strict';

var buffersEqual = require('buffer-equal-constant-time');
var mongoose = require('mongoose');
var schemas = require('../schemas');
var cache = require('../cache');
var constants = require('../../constants');
var parseFile = require('../file').parse;

var LB = "\n\r";

var saveArticle = function(opts, success, fail){

  console.log(' **  saving article');
  var Article = mongoose.model('Article', schemas.article);
  var query = {author:opts.user._id, filename: opts.filename};

  Article.findOne(query, function(err, article){
    if (err) {
      console.log('Error: ', err);
      fail();
    }

    if (article) { // update

      var paths = [
        "/~" + opts.user.username,
        "/~" + opts.user.username + "/",
        "/~" + opts.user.username +"/"+ article.slug +"-"+  article._id];

      article.raw = opts.payload;

      var processed = parseFile(opts.filename, opts.payload);

      if(processed === false) {
        fail();
        return;
      }

      article.title = processed.title;
      article.content = processed.payload;
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
        cache.delAll(paths);

        console.log('deleting', paths);

        success();

      }); // end update

    } else { // if article doesn't exist, create

      var file = require('../file').parse;
      var processed = parseFile(opts.filename, opts.payload);

      if(processed === false) {
        fail();
        return;
      }

      var values = {
        title: processed.title,
        content: processed.payload,
        raw: opts.payload,
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
        cache.delAll([
          "/~" + opts.user.username,
          "/~" + opts.user.username + "/"]);

        opts.user.nextNum++;
        opts.user.save();

        success();

      }); // end create new
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
    var command = info.command.split(' ', 1);
    var args = info.command.substring(command[0].length+1).trim();
    console.log(' **  attempts: ' + command + ' ' + args);

    if(userMeta.next === 'auth') {

      if(command[0] === 'key') {
        // save args to logged in user
        if(args.trim().length===0) {
          stream.write('→ You need to provide a key.\n\r');
          stream.exit(-1);
          stream.end();
          return;
        }
        stream.write('… Saving key to user\n\r');
        userMeta.user.publicKey = args;
        userMeta.user.save(function(err){
          if(err) {
            console.log(err);
            stream.write('→ Key failed to save.\n\r');
            stream.exit(-1);
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
        var parts = path.match(/^(draft|public)\/(?:.*\/)*(.*)$/i);

        var status = 'draft';
        if(parts && parts[1] === 'public') status = 'published';

        var filename = (parts && parts[2]) ? parts[2].trim() : '';
        filename = (parts === null) ? ((path[0]==='/') ? path.substring(1) : path) : filename;

        console.log('filename:', filename);

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
            payload += buffer;
            stream.write('\x00', 'binary');
            console.log(' **  receiving scp payload', payload.length, head);
          }

          if( (new Buffer(payload)).length >= parseInt(head[1]) && !saved) {
            console.log(' **  saving', filename.trim(), status.trim(), 'by', userMeta.user.username);
            saveArticle({
              payload: dec.write(payload).substring(0, head[1]),
              status: status.trim(),
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
        var parts = path.match(/^(draft|public)\/(?:.*\/)*(.*)$/i);

        var status = 'draft';
        if((parts && parts[1] === 'draft') || path == '~') status = 'draft';
        if((parts && parts[1] === 'public') || path == '/') status = 'published';

        var filename = (parts && parts[2]) ? parts[2].trim() : '';
        filename = (parts === null) ? ((path[0]==='/') ? path.substring(1) : path) : filename;

        var Article = mongoose.model('Article', schemas.article);
        var query = {author:userMeta.user._id, filename:filename};

        if(parts && parts[1]!=='~') {
          query.status = status;
        }

        Article.findOne(query, function(err, article){
          if (err) console.log('Error: ', err);

          if (article) {

            // console.log(article.raw.length);
            stream.write('C0644 '+(article.raw.trim().length)+' '+article.title+'\n');
            stream.write(article.raw.trim());
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
        console.log(' **  listing');

        var path = args.split(' ').slice(-1).pop().trim();
        var parts = path.match(/^~?\/?(draft|public)\//i);

        var Article = mongoose.model('Article', schemas.article);
        var query = {author:userMeta.user._id};

        if(parts && parts[1]==='draft') query.status = 'draft';
        if(parts && parts[1]==='public') query.status = 'published';

        Article.find(query).limit(100).exec(function(err, articles){
          if (err) console.log('Error: ', err);

          if(articles) {
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
      else if(command[0]==='mv') {
        var source = args.split(' ').slice(1).shift().trim();
        var destination = args.split(' ').slice(-1).pop().trim();
        var parts = destination.match(/^(draft|public)\/(?:.*\/)*(.*)$/i);

        console.log(source, destination, parts);

        var status = 'draft';
        if((parts && parts[1] === 'draft') || path == '~') status = 'draft';
        if((parts && parts[1] === 'public') || path == '/') status = 'published';

        var filename = (parts && parts[2]) ? parts[2].trim() : '';
        filename = (parts === null) ? ((path[0]==='/') ? path.substring(1) : path) : filename;

        var Article = mongoose.model('Article', schemas.article);

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
            cache.delAll([
              "/~" + userMeta.user.username,
              "/~" + userMeta.user.username + "/",
              "/~" + userMeta.user.username + "/" + article.slug + "-" +  article._id]);

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

            cache.delAll([
              "/~" + userMeta.user.username,
              "/~" + userMeta.user.username + "/",
              "/~" + userMeta.user.username +"/"+ article.slug +"-"+  article._id]);

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

      if(command[0] === 'key') {
        // save args to logged in user
        console.log(userMeta.username);

        if(args.trim().length===0) {
          stream.write('→ You need to provide a key.\n\r');
          stream.exit(-1);
          stream.end();
          return;
        }

        if(/^[a-z0-9]{2,12}$/.test(userMeta.username)) {
          stream.write('→ Usernames must be 2-12 long, and only use alphanumeric characters.\n\r');
          stream.exit(-1);
          stream.end();
          return;
        }
        stream.write('… Registering user\n\r');

        var User = mongoose.model('User', schemas.user);
        User.findOne({username: userMeta.username}, function(err, user){
          if(err) {
            console.log(err);
            stream.write('→ Key failed to save.\n\r');
            stream.exit(-1);
            stream.end();
          } else {
            if(!user) {

              var hash = require('sha256');
              var salt = schemas.randomString(32);
              var randPassword = schemas.randomString(8);

              var user = new User({
                username: userMeta.username,
                hash: hash(randPassword + salt),
                salt: salt,
                publicKey: args
              });

              console.log(' **  saving user '+user.username);
              user.save(function (err, user) {
                if (err) {
                  console.log(err);
                  stream.write('→ Key failed to save.\n\r');
                  stream.exit(-1);
                  stream.end();
                }
                if (user) {
                  stream.write('✓ Account created, do not forget your password.\n\r');
                  stream.write('→ Random password set:\n\r');
                  stream.write('\n  '+randPassword+'\n\n\r');
                  stream.write('→ You can reset your public key later using:\n\r');
                  stream.write('\n  ssh '+user.username+'@localhost key $(cat ~/.ssh/id_rsa.pub)\n\n\r');
                  stream.write('→ Save files with the extension .md to post in markdown, .txt or none otherwise.\n\r');
                  stream.write(constants.licenseline+'\n\r');
                  stream.exit(0);
                } else {
                  stream.write('→ Account creation failed, kindly try again.\n\r');
                  stream.exit(-1);
                }
                stream.end();
              });

            } else { //if !user
              // this block is unreachable, because if the username exists..
              // it will trigger auth, if key doesn't match will ask pass
              console.log(user);
              stream.write('⨯ This username is taken.\n\r');
              stream.exit(-1);
              stream.end();
            }
          }
        })


      } // end of command key
      else {
        stream.write('→ Command not available for unauthorized user.\n\r');
        stream.exit(-1);
        stream.end();
      }

    }

  }
}
