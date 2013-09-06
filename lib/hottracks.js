var superagent = require('superagent');

module.exports = HotScTracks;

var MAX_CACHE_LIFETIME = 1000 * 60 * 60; // 1 hour
var SC_ENDPOINT = "http://api.soundcloud.com";

// id should be for example room id
function HotScTracks(id, redisClient) {
  this.id = id;
  this.redisClient = redisClient;
}

// retrieve a hot track and remove it from the cache
// tagList looks like ['trance', 'techno']
// cache is automatically repopulated under 2 conditions
// 1. cache goes empty
// 2. cache gets old
// callback(err, trackObject)
HotScTracks.prototype.pop = function(tagList, callback) {
  var self = this;
  if (tagList) {
    tagList = unique(tagList.map(lowerAndTrim));
    tagList.sort(strCmp);
  } else {
    tagList = [];
  }
  // tagListStr is a canonical key
  var tagListStr = tagList.join(',');
  var redisKey = "hotsctracks:cache:" + self.id + ":" + tagListStr;
  tryPop();

  function tryPop(err) {
    if (err) {
      callback(err);
    } else {
      self.redisClient.spop(redisKey, onPop);
    }
  }

  function onPop(err, track) {
    if (err) {
      callback(err);
    } else if (!track) {
      // this occurs when the cache is empty or it expires
      self.refillCache(redisKey, tagListStr, tryPop);
    } else {
      callback(null, track);
    }
  }
}

HotScTracks.prototype.refillCache = function(redisKey, tagListStr, callback) {
  var self = this;
  var url = SC_ENDPOINT + "/tracks.json";
  var req = superagent.get(url);
  req.query({
    client_id: 'YOUR_CLIENT_ID', // TODO: do we have to authenticate or something?
    tags: tagListStr,
    filter: 'streamable',
  });
  req.end(function(err, resp) {
    if (err) {
      callback(err);
    } else if (!resp.ok) {
      callback(new Error("SoundCloud API status " + resp.status));
    } else if (!Array.isArray(resp.body)) {
      callback(new Error("Expected response to be a JSON list"));
    } else {
      var args = resp.body.map(JSON.stringify);
      args.unshift(redisKey);
      self.redisClient.multi()
        .sadd(args)
        .pexpire(redisKey, MAX_CACHE_LIFETIME)
        .exec(callback);
    }
  });
}

function strCmp(a, b) {
  if (a < b) {
    return -1;
  } else if (b > a) {
    return 1;
  } else {
    return 0;
  }
}

function lowerAndTrim(str) {
  return str.trim().toLowerCase();
}

function removeDuplicates() {
  var seen = {};
  return function(item) {
    var val = !seen[item];
    seen[item] = true;
    return val;
  };
}

function unique(array) {
  var obj = {};
  array.forEach(function(item) {
    obj[item] = true;
  });
  return Object.keys(obj);
}
