'use strict';

var express     = require('express');
var exphbs      = require('express-handlebars');
var bodyParser  = require('body-parser');
var mongoose    = require('mongoose');
var constants   = require('./constants');
var schemas     = require('./lib/schemas');
var cache       = require('./lib/cache');
var ratelimit   = require('./lib/ratelimit');

var hbs = exphbs.create({
  defaultLayout: 'user',
  extname: '.hbs',
  helpers: {
    shortDate: function (date) {
      return (date) ? date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    },
    shorterDate: function (date) {
      return (date) ? date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) +' '+ date.toLocaleDateString('en-GB', { year: 'numeric' }): '';
    },
    getTime: function (date) {
      return date.getTime();
    }
  }
});

var User    = mongoose.model('User', schemas.user);
var Article = mongoose.model('Article', schemas.article);

var app = express();

app.use(function(req, res, next){
  if (process.env.NODE_ENV === 'production' && req.hostname !== constants.hostname) {
    res.header('Content-Type', 'text/plain');
    res.status(404).send('(ﾉ´ヮ´)ﾉ*:･ﾟ✧');
    res.end();
  } else {
    next();
  }
});

app.use(bodyParser.text());

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
if (process.env.NODE_ENV !== 'development') { app.enable('view cache'); }

app.use(['/~:username', '/~:username*'], function (req, res, next) {

  User.findOne({username: req.params.username}, function(err, user){
    if (err) { console.log('Error: ', err); }

    if (user) {
      req.user = user;
      next();
    } else {
      res.status(404);
      res.render('error', {message: 'NOT FOUND', layout: false});
      // next();
    }
  });

});

app.use(function(err, req, res, next) {
  console.log(err.stack);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500);
  res.render('error', {message: 'ERROR', layout: false});
});

app.get('/~:username/*-:id', cache.route(), function (req, res) {

  res.setHeader("Content-Security-Policy", "script-src 'none'");

  Article
  .findOne({author: req.user._id, _id: req.params.id, status: 'published'})
  .exec(function(err, article){
    if (err) { console.log('Error: ', err); }
    // use txt if blank or extension not found i.e. ext === filename

    if (article) {
      var format = (article.filename) ? article.filename.substring(article.filename.lastIndexOf('.')+1) : 'txt';
      format = (format === article.filename) ? 'txt' : format;
      res.render('post', {user: req.user, article: article, isPost: true, format: format, constants: constants});
    } else {
      res.status(404);
      res.render('error', {message: 'NOT FOUND', layout: false, constants: constants});
    }

  });

});


app.get('/~:username/feed', cache.route(), function (req, res) {

  res.setHeader("Content-Security-Policy", "script-src 'none'");

  var Feed = require('feed');
  var feed = new Feed({
    title:          '~'+req.user.username,
    link:           constants.protocol+'://'+constants.host+'/~'+req.user.username,
    copyright:      'All Rights Reserved '+(new Date().getFullYear())+', '+req.user.username,

    author: {
      title:          '~'+req.user.username,
      link:           constants.protocol+'://'+constants.host+'/~'+req.user.username
    }
  });

  Article
  .find({author: req.user._id, status: 'published'})
  .sort({published_ts: -1})
  .limit(20)
  .exec(function(err, posts){
    if (err) { console.log('Error: ', err); }

    for (var key in posts) {
      feed.item({
        title: posts[key].title,
        link: constants.protocol+'://'+constants.host+'/~'+req.user.username+'/'+posts[key].slug+'-'+posts[key]._id,
        description: posts[key].content,
        author: [{
          title: '~'+req.user.username,
          link: constants.protocol+'://'+constants.host+'/~'+req.user.username
        }],
        date: posts[key].published_ts,
      });

    }

    res.set('Content-type', 'text/xml');
    res.send(feed.render('atom-1.0'));

  });

});

app.get('/~:username', cache.route(), function (req, res) {

  res.setHeader("Content-Security-Policy", "script-src 'none'");

  var query = {
    author: req.user._id,
    status: 'published'
  }

  if( req.query.before ) {
    query.published_ts = {'$lt': new Date(parseInt(req.query.before))};
  }

  var pageLength = 40;

  Article
  .find(query)
  .sort({published_ts: -1})
  .limit(pageLength)
  .exec(function(err, articles){
    if (err) { console.log('Error: ', err); }

    var templateData = {user: req.user, articles: articles, isIndex: true, constants: constants};

    if( req.query.before ) {
      templateData.before = true;
    }

    if( articles.length == pageLength ) {
      templateData.showNav = true;
    }

    res.render('index', templateData);

  });

});

app.get('/', cache.route({ expire: 300  }), function (req, res) {

  res.render('home', {
    layout: 'main',
    latest: constants.latest,
    constants: constants});

});

app.get('/terms', cache.route(), function (req, res) {

  res.render('terms', {
    layout: 'main',
    latest: constants.latest,
    constants: constants});

});

app.get('/privacy', cache.route(), function (req, res) {

  res.render('privacy', {
    layout: 'main',
    latest: constants.latest,
    constants: constants});

});

app.get('/about', cache.route(), function (req, res) {

  res.render('about', {
    layout: 'main',
    latest: constants.latest,
    constants: constants});

});

app.get('/ls', cache.route(), function (req, res) {

  res.setHeader("Content-Security-Policy", "script-src 'none'");

  User.find({}, function(err, users){
    if (err) { console.log('Error: ', err); }

    res.render('everyone', {
      layout: 'main',
      users: users,
      constants: constants});
  });

});

app.get('/explore', cache.route(), function (req, res) {

  var query = {
    status: 'published'
  }

  if( req.query.before ) {
    query.published_ts = {'$lt': new Date(parseInt(req.query.before))};
  }

  Article
  .find(query)
  .sort({published_ts: -1})
  .populate('author')
  .limit(12)
  .exec(function(err, articles){
    if (err) { console.log('Error: ', err); }

    res.render('explore', {
      layout: 'main',
      articles: articles,
      constants: constants,
      before: (req.query.before) ? new Date(parseInt(req.query.before)) : false
    });

  });

});

app.get('*', function(req, res){
  res.status(404);
  res.render('error', {message: 'NOT FOUND', layout: false});
});

var server = app.listen(constants.port, function () {
  var host = server.address().address;
  var port = server.address().port;
});

require('./lib/ssh-server').listen(2222, function(){
  console.log('SSH Server Running');
});
