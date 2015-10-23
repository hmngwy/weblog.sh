module.exports = {
  brand: 'weblog.sh',
  hostname: process.env.HOSTNAME || 'localhost:3000',
  protocol: process.env.PROTOCOL || 'http',
  port: process.env.PORT || 3000,
  mongourl: process.env.MONGO_URL || 'mongodb://localhost/weblogsh',
  endpointurl: process.env.ENDPOINT || 'http://localhost:3000/endpoint',
  latest: process.env.LATESTCLIENT || 'blog-0.1.1',
  downloadpath: process.env.DOWNLOADPATH || '/d'
}
