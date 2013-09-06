var sc = require('./sc');

module.exports = ScTrackCache;

// how long to keep a track in cache
var CACHE_DURATION_SECS = 60 * 60 * 8; // 8 hours

function ScTrackCache(redisClient) {
  this.redisClient = redisClient;
}

ScTrackCache.prototype.fetch = function(trackId, callback) {
  var self = this;
  var key = redisKey(trackId);
  self.redisClient.get(key, function(err, trackJson) {
    if (err) {
      console.error("Error getting track from cache:", err.stack);
    }
    var cacheHit = !err && trackJson;
    if (cacheHit) {
      callback(null, JSON.parse(trackJson));
    } else {
      fetchFromApi();
    }
  });
  function fetchFromApi() {
    sc.get('/track/' + trackId + '.json', {}, function(err, trackJson) {
      // add to cache
      var track = JSON.parse(trackJson);
      self.insertOne(track);
      callback(null, track);
    });
  }
};

ScTrackCache.prototype.insertOne = function(track) {
  this.insertMulti([track]);
};

ScTrackCache.prototype.insertMulti = function(tracks) {
  var multi = this.redisClient.multi();
  tracks.forEach(function(track) {
    var key = redisKey(track.id);
    var trackJson = JSON.stringify(track);
    multi.setex(key, CACHE_DURATION_SECS, trackJson);
  });
  multi.exec(function(err) {
    if (err) {
      console.error("Error inserting track into cache:", err.stack);
    }
  });
};

function redisKey(trackId) {
  return 'sctrackscache:' + trackId;
}
