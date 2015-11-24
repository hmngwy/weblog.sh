var linkPattern = /(\[([\w*\ .\-\+\!\@\#\$\%\^\&\*\(\)\{\}\<\>\,\?\/\'\"\;\:\\]+)\ ((https?|ftp|mailto):\/\/[^\s/$.?#].[^\s]*)\])+/gi;

var linkReplacer = function(match, full, text, url, string){
  return '<a href="'+url+'" rel="nofollow">'+text+'</a>';
}

module.exports = function(filename, payload){
  var raw = payload;
  var payload = payload.trim();

  if(payload.length === 0) {
    return false;
  }

  var Entities = require('html-entities').AllHtmlEntities;
  var entities = new Entities();
  var ext = filename.substring(filename.lastIndexOf('.')+1);


  // if .txt
  if(ext === 'txt' || ext === filename) {
    payload = entities.encode(payload);

    var lines = payload.split("\n\n");
    var title = lines.shift();
    title = title.trim();

    // remove empty lines
    lines = lines.filter(function(s){ return s.trim() != ''; });
    // wrap lines in <p>
    lines = lines.map(function(s){ return "<p>"+s.replace(/\n/gi, '<br>')+"</p>"; });
    // rejoin array to string
    payload = lines.join("\n").trim();
    // link processing
    payload = payload.replace(linkPattern, linkReplacer);

  } // endif .txt
  else if(ext === 'md') {
    var cheerio = require('cheerio');
    var markdown = require('markdown-it')({
      html: false,
      linkify: true,
      typographer: true
    })
      .use(require('markdown-it-footnote'));

    payload = markdown.render(payload);

    var dom = cheerio.load(payload);
    var title = dom('h1').first().text();

    dom('h1').remove(); // now remove it

    payload = dom.html().trim();

  } // endif .md

  return {title: title, payload: payload, raw: raw}
}
