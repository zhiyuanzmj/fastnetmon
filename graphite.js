var graphite = require('graphite');
var client = graphite.createClient('plaintext://localhost:2003/');
var metrics = {foo: 23};
client.write(metrics, function(err) {
  // if err is null, your data was sent to graphite!
  console.log(err)
});
