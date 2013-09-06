var sc = require('./sc');
var Pend = require('pend');
var TrackCache = require('./track_cache');

module.exports = HotScTracks;

var MAX_CACHE_LIFETIME = 1000 * 60 * 60 * 8; // 8 hours

// id should be for example room id
function HotScTracks(id, redisClient) {
  this.id = id;
  this.redisClient = redisClient;
  this.trackCache = new TrackCache(redisClient);
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
  var redisKey = "hotsctracks:cacheids:" + self.id + ":" + tagListStr;
  tryPop();

  function tryPop(err) {
    if (err) {
      callback(err);
    } else {
      self.redisClient.spop(redisKey, onPop);
    }
  }

  function onPop(err, trackId) {
    if (err) {
      callback(err);
    } else if (!trackId) {
      // this occurs when the cache is empty or it expires
      self.refillCache(redisKey, tagList, tryPop);
    } else {
      self.trackCache.fetch(trackId, callback);
    }
  }
}

HotScTracks.prototype.refillCache = function(redisKey, canonicalTagList, callback) {
  var self = this;
  var pend = new Pend();
  console.info("canonicalTagList", canonicalTagList);
  canonicalTagList.forEach(function(tag) {
    pend.go(fetchFnForTag(tag));
  });
  pend.wait(function(err) {
    if (err) {
      callback(err);
      return;
    }
  });
  function fetchFnForTag(tag) {
    return function(cb) {
      var query = {
        tags: tag,
        filter: 'streamable',
      };
      sc.get('/tracks.json', query, function(err, body) {
        if (err) {
          callback(err);
        } else if (!Array.isArray(body)) {
          callback(new Error("Expected response to be a JSON list"));
        } else {
          addIdsToOurCache();
          addDataToTrackCache();
        }

        function addDataToTrackCache() {
          self.trackCache.insertMulti(body);
        }

        function addIdsToOurCache() {
          var args = body.map(extractId);
          args.unshift(redisKey);
          self.redisClient.multi()
            .sadd(args)
            .pexpire(redisKey, MAX_CACHE_LIFETIME)
            .exec(callback);
        }
      });
    };
  }
}

function extractId(obj) {
  return obj.id;
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
