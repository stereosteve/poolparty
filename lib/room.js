var EventEmitter = require('events').EventEmitter
var Redis = require('redis')
var redis = Redis.createClient()
var noop = function(){}
var HotTracks = require('./hot_tracks');
var TrackCache = require('./track_cache');

var MIN_QUEUE_LEN = 2;
var MAX_CHAT_MSG_LEN = 400;

redis.select(process.env.REDIS_DB)
redis.on("error", function (err) {
    console.error("redis error", err);
});



module.exports = Room

function Room(name) {
  if (!name) throw new Error("room name is required")
  this.name = name
  this.tagList = ['trance', 'bluegrass'];
  this.hotTracks = new HotTracks(name, redis);
  this.trackCache = new TrackCache(redis);
  this.memberMap = {}
  setInterval(this.tick.bind(this), 500)
  this.getNowPlaying()
  this.autoFillQueue();
}

Room.prototype.__proto__ = EventEmitter.prototype;


// getters

Room.prototype.key = function() {
  var args = Array.prototype.slice.call(arguments, 0);
  args.unshift(this.name)
  return args.join(':')
}

Room.prototype.getQueue = function(cb) {
  var key = this.key('queue')
  redis.lrange(key, -100, -1, function(err, data) {
    if (err) return cb(err)
    data = data.map(JSON.parse)
    cb(null, data)
  })
}

Room.prototype.getChats = function(cb) {
  var key = this.key('chat')
  redis.lrange(key, -100, -1, function(err, chats) {
    if (err) return cb(err)
    chats = chats.map(JSON.parse)
    cb(null, chats)
  })
}

Room.prototype.getNowPlaying = function(cb) {
  cb = cb || noop
  var self = this
  redis.get(this.key('nowPlaying'), function(err, data) {
    if (err) return cb(err)
    if (!data) return cb()
    self.nowPlaying = JSON.parse(data)
    return cb(null, self.nowPlaying)
  })
}

// user actions
Room.prototype.chatBy = function(user, message, cb) {
  message = (message || "").trim();
  if (message.length === 0 || message.length > MAX_CHAT_MSG_LEN) {
    return;
  }
  if (message === '/next') {
    this.skipBy(user);
    return;
  }
  var ev = {
    type: 'chat',
    message: message,
    user: user,
    time: new Date(),
  }
  this.emit('broadcast', ev)
  redis.rpush(this.key('chat'), JSON.stringify(ev), cb)
}

Room.prototype.enqueueIdBy = function(user, trackId) {
  var self = this;
  self.trackCache.fetch(trackId, function(err, track) {
    if (err) {
      console.error("Error fetching track:", err.stack);
      return;
    }
    self.enqueueBy(user, track);
  });
};

Room.prototype.enqueueBy = function(user, track) {
  var ev = {
    type: 'enqueue',
    track: track,
    user: user,
    time: new Date(),
  }
  this.emit('broadcast', ev)
  var self = this
  redis.rpush(this.key('queue'), JSON.stringify(ev), function(err) {
    if (err) {
      console.error("Error queueing track:", err.stack);
      return;
    }
    if (!self.nowPlaying) {
      self.next()
    }
  })
}

Room.prototype.skipBy = function(user) {
  this.next()
}

Room.prototype.visitBy = function(user) {
  var memberMap = this.memberMap
  var member = memberMap[user.id]
  if (!member) {
    member = memberMap[user.id] = {
      id: user.id,
      user: user,
      joinedAt: Date.now(),
      seenAt: Date.now(),
    }
    this.emit('broadcast', {
      type: 'memberJoined',
      member: member,
    })
  }
  member.seenAt = Date.now()
}


// playback control

Room.prototype.tick = function() {
  this.emit('broadcast', {
    type: 'tick',
    now: Date.now(),
  })
  if (this.nowPlaying && Date.now() > this.nowPlaying.endAt) {
    // ensure we don't call next again while waiting for network operations
    this.nowPlaying = null;
    this.emit('trackEnded')
    this.next()
  }

  var self = this
  Object.keys(this.memberMap).forEach(function(memberId) {
    var member = self.memberMap[memberId]
    var diff = Date.now() - member.seenAt
    if (diff > 12000) {
      self.emit('broadcast', {
        type: 'memberLeft',
        id: memberId,
        time: Date.now(),
      })
      self.memberMap[memberId] = undefined;
      delete self.memberMap[memberId]
    }
  })
}

Room.prototype.play = function(data) {
  data.type = 'nowPlaying'
  data.startAt = Date.now()
  data.endAt = data.startAt + data.track.duration

  this.nowPlaying = data
  redis.set(this.key('nowPlaying'), JSON.stringify(data))
  redis.rpush(this.key('chat'), JSON.stringify(data))
  this.emit('broadcast', data)
}

Room.prototype.next = function() {
  var self = this
  var queueKey = this.key('queue');
  redis.lpop(queueKey, function(err, queueItemJson) {
    if (err) {
      console.error("Error popping queue:", err.stack);
      return;
    }
    if (queueItemJson) self.play(JSON.parse(queueItemJson));
    self.autoFillQueue();
  });
}

Room.prototype.autoFillQueue = function() {
  var self = this;
  redis.llen(self.key('queue'), function(err, queueLen) {
    if (err) {
      console.error("Error checking queue length:", err.stack);
      return;
    }
    var catchup = MIN_QUEUE_LEN - queueLen;
    for (var i = 0; i < catchup; i += 1) {
      self.hotTracks.pop(self.tagList, queueHotTrack);
    }
  });
  function queueHotTrack(err, track) {
    if (err) {
      console.error("Error getting hot track:", err.stack);
      return;
    }
    self.enqueueBy(null, track);
  }
}
