var should = require('should');
var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/weblogtests');

var user = require('../lib/user');
var schemas = require('../lib/schemas');
var User = mongoose.model('User', schemas.user);
var hash = require('sha256');

describe('user', function() {

  describe('isValidKey', function() {
    var goodKey = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCjsocgIBvqLS6lz+745qCT/E/GSpKPJ21Igxe6LYq55HhPqsIQ/mC0eFhTxZsctX5/Ze2vxlNd/sKD/pk/DUU3QBs6JbW91xqbr8jFuuTuo5rxOQ6wNrZ6aM7oVcz/yDk3a3FKkn0WO1mT9RoBnSMui4zjQmccf+IhJjXMNb4oycz4JfMQo41xe3P+ly/qI0ZKo/afPojMotc1i4saeXcczB679KgyIMh6fdSvq1PlqIpJWzrx2VxsZDYfY36kHQD9d4/DAMDBp/qChRNKG9T3iFsYGzb/X4WdFAt0CWHzXpnSfZAw9EXwWV31VzEmx5/Z+haIHwTiEx7T8pn8eRF/ hashbang@macbook.local';
    var badKey = ' \n';

    var goodCheck = user.isValidKey(goodKey);
    var badCheck = user.isValidKey(badKey);

    it('should return true if good key', function() {
      goodCheck.should.equal(true);
    });

    it('should return false if bad key', function() {
      badCheck.should.equal(false);
    });
  });

  describe('isValidUsername', function() {
    var goodUsername = 'goodie123';
    var tooShortUsername = 'a';
    var tooLongUsername = 'abcdefghijklm';
    var specialCharUsername = 'bad-123';

    var goodCheck = user.isValidUsername(goodUsername);
    var shortCheck = user.isValidUsername(tooShortUsername);
    var longCheck = user.isValidUsername(tooLongUsername);
    var specialCheck = user.isValidUsername(specialCharUsername);

    it('should return true if /^[a-z0-9]{2,12}$/', function() {
      goodCheck.should.equal(true);
    });

    it('should return false if too short', function() {
      shortCheck.should.equal(false);
    });

    it('should return false if too long', function() {
      longCheck.should.equal(false);
    });

    it('should return false if has special', function() {
      specialCheck.should.equal(false);
    });
  });

  describe('isValidPassword', function() {
    var goodPassword = 'secret password @!#';
    var badPassword = '';

    var goodCheck = user.isValidPassword(goodPassword);
    var badCheck = user.isValidPassword(badPassword);

    it('should return true if good', function() {
      goodCheck.should.equal(true);
    });

    it('should return false if bad', function() {
      badCheck.should.equal(false);
    });

  });

  var newUser;

  describe('create', function() {
    var username = 'batman';
    var key = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCjsocgIBvqLS6lz+745qCT/E/GSpKPJ21Igxe6LYq55HhPqsIQ/mC0eFhTxZsctX5/Ze2vxlNd/sKD/pk/DUU3QBs6JbW91xqbr8jFuuTuo5rxOQ6wNrZ6aM7oVcz/yDk3a3FKkn0WO1mT9RoBnSMui4zjQmccf+IhJjXMNb4oycz4JfMQo41xe3P+ly/qI0ZKo/afPojMotc1i4saeXcczB679KgyIMh6fdSvq1PlqIpJWzrx2VxsZDYfY36kHQD9d4/DAMDBp/qChRNKG9T3iFsYGzb/X4WdFAt0CWHzXpnSfZAw9EXwWV31VzEmx5/Z+haIHwTiEx7T8pn8eRF/ hashbang@macbook.local';
    var invalidUsername = 'bat-mun';
    var invalidKey = ' \n';

    it('should create a user', function(done) {
      user.create({
        username: username,
        key: key,
        onSave: function(){
          done();
        }
      });
    });

    it('should be found when queried', function() {
      User.findOne({username: username}, function(err, user){
        newUser = user;
        should.exist(newUser);
      });
    });

    it('should err if existing', function(done) {
      user.create({
        username: username,
        key: key,
        onUsernameTaken: function(){
          done();
        }
      });
    });

    it('should err if invalid username', function(done) {
      user.create({
        username: invalidUsername,
        key: key,
        onBadUsername: function(){
          done();
        }
      });
    });

    it('should err if invalid key', function(done) {
      user.create({
        username: username,
        key: invalidKey,
        onBadKey: function(){
          done();
        }
      });
    });

  });

  describe('rekey', function(done) {
    it('should change the set publicKey', function() {
      var newKey = 'NEWKEY';
      var existingUser = newUser;

      user.rekey({
        user: existingUser,
        key: newKey,
        onSuccess: function(user){
          user.publicKey.should.be.equal(newKey);
        }
      });

    });

    it('should err if missing user', function(done) {
      user.rekey({
        key: 'NEWKEY',
        onError: function(msg){
          done()
        }
      });
    });

    it('should err if missing key', function(done) {
      user.rekey({
        user: newUser,
        onError: function(msg){
          done()
        }
      });
    });

    it('should err if bad key', function(done) {
      user.rekey({
        user: newUser,
        key: ' \n',
        onBadKey: function(msg){
          done()
        }
      });
    });

  });

  describe('password', function() {

    it('should change the set password', function() {
      var newPassword = 'SECRET SECRET';
      var existingUser = newUser;
      user.password({
        user: existingUser,
        password: newPassword,
        onSuccess: function(user){
          user.hash.should.be.equal(hash(newPassword + user.salt));
        }
      });
    });

    it('should err if bad password', function(done) {
      var existingUser = newUser;
      user.password({
        user: existingUser,
        password: '',
        onBadPassword: function(){
          done();
        }
      });
    });

    it('should err if user unset', function(done) {
      var existingUser = newUser;
      user.password({
        user: existingUser,
        password: '',
        onBadPassword: function(){
          done();
        }
      });
    });

  });

  User.remove({}, function(){});

});
