var Entities = require('html-entities').AllHtmlEntities;
var entities = new Entities();
var cheerio = require('cheerio');
var xss = require('xss');
var markdown = require('markdown-it')({
  html: false,
  linkify: true,
  typographer: true
}).use(require('markdown-it-footnote'));

var linkPattern = /(\[([\w*\ .\-\+\!\@\#\$\%\^\&\*\(\)\{\}\<\>\,\?\/\'\"\;\:\\]+)\ ((https?|ftp|mailto):\/\/[^\s/$.?#].[^\s]*)\])+/gi;

var linkReplacer = function(match, full, text, url, string){
  return '<a href="'+url+'" rel="nofollow">'+text+'</a>';
};

var self = module.exports = {
  extractExtension: function(filename) {
    return filename.substring(filename.lastIndexOf('.')+1);
  },

  isTextFile: function(filename) {
    var ext = self.extractExtension(filename);
    return ext === 'txt' || ext === filename;
  },

  isMarkdownFile: function(filename) {
    return self.extractExtension(filename) === 'md';
  },

  parseTextPayload: function(dirty_payload) {
    var payload = entities.encode(dirty_payload);

    var lines = payload.split("\n\n");
    var title = lines.shift();
    title = title.trim();

    // remove empty lines
    lines = lines.filter(function(s) {
      return s.trim() != '';
    });
    // wrap lines in <p>
    lines = lines.map(function(s) {
      return '<p>' + s.replace(/\n/gi, '<br>') + '</p>';
    });
    // rejoin array to string
    payload = lines.join('\n').trim();
    // link processing
    payload = payload.replace(linkPattern, linkReplacer);

    return {title: title, payload: payload};
  },

  parseMarkdownPayload: function(payload) {
    var dom = cheerio.load(markdown.render(payload));
    var title = dom('h1').first().text();
    var payload;
    if(title) {
      dom('h1').remove();
      payload = dom.html();
    } else {
      // minimum "# title" not found
      var lines = payload.trim().split('\n');
      var title = lines.shift(); //use first line instead
      payload = lines.join('\n').trim(); //rejoin lines
      payload = markdown.render(payload); //use remaining as payload
    }

    return {title: title.trim(), payload: payload.trim() };
  },

  parse: function(filename, raw){
    var trimmed = raw.trim();
    var parsed = null;

    if(trimmed.length === 0) {
      return false;
    }

    if(self.isTextFile(filename)) {
      parsed = self.parseTextPayload(trimmed);
    } else if(self.isMarkdownFile(filename)) {
      parsed = self.parseMarkdownPayload(trimmed);
    } else {
      // Bad extension!
      return false;
    }

    return {title: xss(parsed.title.trim()), payload: xss(parsed.payload), raw: raw};
  }
};
