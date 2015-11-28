'use strict';

var buffersEqual = require('buffer-equal-constant-time');
var mongoose = require('mongoose');
var schemas = require('../schemas');
var cache = require('../cache');
var constants = require('../../constants');
var user = require('../user');
var article = require('../article');

var LB = "\n\r";

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

        user.rekey({
          user: userMeta.user,
          key: args,
          onBadKey: function(){
            stream.write('→ You need to provide a key.\n\r');
            stream.exit(-1);
            stream.end();
          },
          onError: function(){
            stream.write('→ Key failed to save.\n\r');
            stream.exit(-1);
            stream.end();
          },
          onSuccess: function(user){
            stream.write('→ User '+user.username+' public key updated.\n\r');
            stream.exit(0);
            stream.end();
          }
        });

      } // end of command key
      else if(command[0] === 'password') {

        user.password({
          user: userMeta.user,
          password: args,
          onBadPassword: function(){
            stream.write('→ You need to specify a password.\n\r');
            stream.exit(-1);
            stream.end();
          },
          onError: function(){
            stream.write('→ Password update failed.\n\r');
            stream.exit(-1);
            stream.end();
          },
          onSuccess: function(user){
            stream.write("→ Password for "+user.username+" updated.\n\r");
            stream.exit(0);
            stream.end();
          }
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
            article.save({
              payload: dec.write(payload).substring(0, head[1]),
              status: status.trim(),
              user: userMeta.user,
              filename: filename.trim(),
              onSuccess: function(){
                console.log(' **  scp success');
                stream.exit(0);
                stream.end();
              },
              onFail: function(quiet){
                if(!quiet) stream.write('\x10', 'binary'); // BAD
                console.log(' **  scp failed');
                stream.exit(-1);
                stream.end();
              }
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

        var query = {author:userMeta.user._id, filename:filename};

        if(parts && parts[1]!=='~') {
          query.status = status;
        }

        article.get({
          query: query,
          onError: function(){
            console.log(' **  scp source faild');
            stream.exit(-1);
            stream.end();
          },
          onNotFound: function(){
            console.log(' **  file not found');
            stream.exit(-1);
            stream.end();
          },
          onFound: function(article){
            console.log(' **  file sent');
            stream.write('C0644 '+(article.raw.trim().length)+' '+article.title+'\n');
            stream.write(article.raw.trim());
            stream.write('\x00', 'binary');
            stream.exit(0);
            stream.end();
          }
        });

      }
      else if(command[0]==='ls') {
        console.log(' **  listing');

        var path = args.split(' ').slice(-1).pop().trim();
        var parts = path.match(/^~?\/?(draft|public)\//i);

        var query = {author:userMeta.user._id};

        if(parts && parts[1]==='draft') query.status = 'draft';
        if(parts && parts[1]==='public') query.status = 'published';

        article.list({
          query: query,
          limit: 100,
          onError: function(){
            console.log(' **  ls failed');
            stream.exit(-1);
            stream.end();
          },
          onNoneFound: function(){
            stream.exit(-1);
            stream.end();
          },
          onFound: function(articles){
            for(var art in articles) {
              if(articles[art].filename!=='')
                stream.write(articles[art].filename+'\n');
            }
            stream.exit(0);
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

      }
      else if(command[0]==='publish' || command[0]==='unpublish') {

        var query = {author:userMeta.user._id, filename:args.trim()};
        var statusDict = {'publish': 'published', 'unpublish': 'draft'};
        var newStatus = statusDict[command[0]];

        article.status({
          query: query,
          status: newStatus,
          user: userMeta.user,
          onError: function(err){
            console.log(' **  status update failed');
            stream.exit(-1);
            stream.end();
          },
          onNotFound: function(){
            stream.write('Article does not exist.'+LB);
            stream.exit(-1);
            stream.end();
          },
          onSuccess: function(article){
            var response = [""];
            response.push("[" + userMeta.user.username + "] → "+article.status+": "+article.title+ " ("+article.filename+")");
            response.push("" + constants.protocol+'://'+constants.host+"/~" + userMeta.user.username +"/"+ article.slug +"-"+  article._id + "\n\n");
            stream.write(response.join(LB));
            stream.exit(0);
            stream.end();
          }
        });
      }
      else if(command[0]==='rm') {

        article.delete({
          user: userMeta.user,
          filename: args.trim(),
          onError: function(err){
            console.log(' **  rm failed');
            stream.exit(-1);
            stream.end();
          },
          onNotFound: function(){
            stream.write('Article does not exist.'+LB);
            stream.exit(-1);
            stream.end();
          },
          onSuccess: function(article){
            var response = [""];
            response.push("[" + userMeta.user.username + "] → deleted: "+article.title+ " ("+article.filename+")\n\n");
            stream.write(response.join(LB));
            stream.exit(0);
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

        stream.write('… Registering user\n\r');
        user.create({
          username: userMeta.username,
          key: args,
          onBadKey: function(){
            stream.write('→ You need to provide a key.\n\r');
            stream.exit(-1);
            stream.end();
          },
          onBadUsername: function(){
            stream.write('→ Usernames must be 2-12 long, and only use alphanumeric characters.\n\r');
            stream.exit(-1);
            stream.end();
          },
          onError: function(err){
            console.log(err);
            stream.write('→ Key failed to save.\n\r');
            stream.exit(-1);
            stream.end();
          },
          onUsernameTaken: function(){
            // this block should be unreacheable in exec.js context
            stream.write('⨯ This username is taken.\n\r');
            stream.exit(-1);
            stream.end();
          },
          onFail: function(){
            stream.write('→ Account creation failed, kindly try again.\n\r');
            stream.exit(-1);
            stream.end();
          },
          onSuccess: function(username, password){
            stream.write('✓ Account created, do not forget your password.\n\r');
            stream.write('→ Random password set:\n\r');
            stream.write('\n  '+password+'\n\n\r');
            stream.write('→ You can reset your public key later using:\n\r');
            stream.write('\n  ssh '+username+'@localhost key $(cat ~/.ssh/id_rsa.pub)\n\n\r');
            stream.write('→ Save files with the extension .md to post in markdown, .txt or none otherwise.\n\n\r');
            stream.write(constants.licenseline+'\n\r');
            stream.exit(0);
            stream.end();
          }
        });

      } // end of command key
      else {
        stream.write('→ Command not available for unauthorized user.\n\r');
        stream.exit(-1);
        stream.end();
      }

    }

  }
}
