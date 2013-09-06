var superagent = require('superagent');

exports.get = get;

var SC_ENDPOINT = "http://api.soundcloud.com";

function get(path, query, callback) {
  var url = SC_ENDPOINT + path;
  var req = superagent.get(url);
  req.query(query);
  req.end(function(err, resp) {
    if (err) {
      callback(err);
    } else if (!resp.ok) {
      callback(new Error("SoundCloud API status " + resp.status));
    } else {
      callback(null, resp.body);
    }
  });
}
