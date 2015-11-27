var mongoose = require('mongoose');
var shortid = require('shortid');
var URLSlugs = require('mongoose-url-slugs');
var constants = require('../constants');

shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+_');

var isProduction = process.env.NODE_ENV == 'production';

function randomString(length) {
  return Math.round((Math.pow(36, length + 1) - Math.random() * Math.pow(36, length))).toString(36).slice(1);
}

var UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function(v) {
        return /^[a-z0-9]{2,12}$/.test(v);
      },
      message: 'username needs to be 2 to 12 lowercase alphanumeric characters only'
    }
  },
  hash: { type: String, required: true },
  salt: { type: String, required: true },
  token: { type: String, default: function() { return randomString(64); }, unique: true },
  nextNum: { type: Number, default: 1 },
  publicKey: { type: String }
})

var ArticleSchema = new mongoose.Schema({
  _id: {
    type: String,
    unique: true,
    'default': shortid.generate
  },
  slug: { type: String },
  num: { type: Number, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  title: { type: String, required: true },
  status: { type: String, default: 'draft' },
  filename: {type: String },
  content: { type: String },
  raw: { type: String, required: true },
  published_ts: { type: Date },
  modified_ts: { type: Date },
});

ArticleSchema.index({author: 1, num: 1}, {unique: true});
ArticleSchema.index({author: 1, filename: 1}, {unique: true});
ArticleSchema.plugin(URLSlugs('title', {field: 'slug', update: true}));


ArticleSchema.pre('save', function(next){
  now = new Date();
  this.modified_ts = now;
  next();
});

module.exports = {
  article: ArticleSchema,
  user: UserSchema,
  randomString: randomString
}
