var should = require('should');
var file = require('../lib/file');

describe('file', function() {
  // We start off with an end-to-end test of the existing code so that
  // we can refactor without worrying that we've broken something.
  describe('parse', function() {
    it('should return the same thing for equivalent text and markdown', function() {
      var header = 'Hello';
      var body = 'World';
      var baseName = 'helloworld.';

      var asText = [header, body].join('\n\n');
      var asMarkdown = ['#' + header, body].join('\n\n');

      var parsedText = file.parse(baseName + '.txt', asText);
      var parsedMarkdown = file.parse(baseName + '.txt', asMarkdown);

      parsedText.payload.should.equal(parsedMarkdown.payload);
      parsedText.title.should.equal(parsedMarkdown.title);
    });
  });

  describe('isTextFile', function() {
    it('should recognize .txt extension', function() {
      file.isTextFile('foobar.txt').should.be.ok();
    });
    it('should recognize no extension', function() {
      file.isTextFile('foobar').should.be.ok();
    });
  });

  describe('isMarkdownFile', function() {
    it('should recognize .md extension', function() {
      file.isMarkdownFile('foobar.md').should.be.ok();
    });
    it('should not recognize no extension', function() {
      file.isMarkdownFile('foobar').should.not.be.ok();
    });
  });

  describe('parseTextFile', function() {
    it('should parse a simple input file', function() {
      var raw = 'Hello\n\nWorld!';
      var expected = {title: 'Hello', payload: '<p>World!</p>'};

      file.parseTextPayload(raw).should.be.deepEqual(expected);
    });
  });

  describe('parseMarkdownFile', function() {
    it('should parse a simple input file', function() {
      var raw = '# Hello\n\nWorld!';
      var expected = {title: 'Hello', payload: '<p>World!</p>'};

      file.parseTextPayload(raw).should.be.deepEqual(expected);
    });
  });
});
