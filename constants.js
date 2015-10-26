module.exports = {
  brand: 'weblog.sh',
  host: process.env.HOST || 'localhost:3000',
  hostname: process.env.HOSTNAME || 'localhost',
  protocol: process.env.PROTOCOL || 'http',
  port: process.env.PORT || 3000,
  mongourl: process.env.MONGO_URL || 'mongodb://localhost/weblogsh',
  endpointurl: process.env.ENDPOINT || 'http://localhost:3000/endpoint',
  latest: process.env.LATESTCLIENT || 'blog-0.2.2',
  downloadpath: process.env.DOWNLOADPATH || '/d',
  md5: process.env.MD5 || 'XXXXXXXXXXXXXXXX'
}
