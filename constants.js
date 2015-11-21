module.exports = {
  brand: 'weblog.sh',
  host: process.env.HOST || 'localhost:3000',
  hostname: process.env.HOSTNAME || 'localhost',
  protocol: process.env.PROTOCOL || 'http',
  port: process.env.PORT || 3000,
  mongourl: process.env.MONGO_URL || 'mongodb://localhost/weblogsh',
  endpointurl: process.env.ENDPOINT || 'http://localhost:3000/endpoint',
  latest: process.env.LATESTCLIENT || 'blog-0.3.3',
  downloadpath: process.env.DOWNLOADPATH || '/d',
  md5: process.env.MD5 || 'XXXXXXXXXXXXXXXX',
  limitmessage: '(ﾉ｀Д´)ﾉ you\'re going too fast!',

  licenseline: "→ By using this service you agree to our License, Terms of Service, and Privacy Policy.\n\n\r"+
    "  GPLV3 License: https://goo.gl/93VKiw\n\r" +
    "  Terms of Service: https://weblog.sh/terms\n\r" +
    "  Privacy Policy: https://weblog.sh/privacy\n\r"
}
