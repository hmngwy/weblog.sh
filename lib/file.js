var Entities = require('html-entities').AllHtmlEntities;
var entities = new Entities();
var cheerio = require('cheerio');
var markdown = require('markdown-it')({
  html: false,
  linkify: true,
  typographer: true
}).use(require('markdown-it-footnote'));

var linkPattern = /(\[([\w*\ .\-\+\!\@\#\$\%\^\&\*\(\)\{\}\<\>\,\?\/\'\"\;\:\\]+)\ ((https?|ftp|mailto):\/\/[^\s/$.?#].[^\s]*)\])+/gi;

var linkReplacer = function(match, full, text, url, string){
  return '<a href="'+url+'" rel="nofollow">'+text+'</a>';
};

module.exports = {
  extractExtension: function(filename) {
    return filename.substring(filename.lastIndexOf('.')+1);
  },

  isTextFile: function(filename) {
    var ext = this.extractExtension(filename);
    return ext === 'txt' || ext === filename;
  },

  isMarkdownFile: function(filename) {
    return this.extractExtension(filename) === 'md';
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
    // Render the markdown...
    var dom = cheerio.load(markdown.render(payload));
    // find the header...
    var title = dom('h1').first().text();
    // and remove it.
    dom('h1').remove();

    return {title: title, payload: dom.html().trim()};
  },

  parse: function(filename, raw){
    var trimmed = raw.trim();
    var parsed = null;

    if(trimmed.length === 0) {
      return false;
    }

    if(this.isTextFile(filename)) {
      parsed = this.parseTextPayload(trimmed);
    } else if(this.isMarkdownFile(filename)) {
      parsed = this.parseMarkdownPayload(trimmed);
    } else {
      // Bad extension!
      return false;
    }

    return {title: parsed.title.trim(), payload: parsed.payload, raw: raw};
  }
};
