var EventEmitter = require('events').EventEmitter
var Redis = require('redis')
var redis = Redis.createClient()
var noop = function(){}

redis.select(process.env.REDIS_DB)
redis.on("error", function (err) {
    console.error("redis error", err);
});



module.exports = Room

function Room(name) {
  if (!name) throw new Error("room name is required")
  this.name = name

  setInterval(this.tick.bind(this), 100)
}

Room.prototype.__proto__ = EventEmitter.prototype;


// getters

Room.prototype.key = function() {
  var args = Array.prototype.slice.call(arguments, 0);
  args.unshift(this.name)
  return args.join(':')
}

Room.prototype.getUserIds = function(cb) {
  var key = this.key('user', '*')
  redis.keys(key, function(err, keys) {
    if (err) return cb(err)
    if (keys.length === 0) return cb(null, [])
    var userIds = keys.map(function(k) {
      return k.split(':')[2]
    })
    return cb(null, userIds)
  })
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
    if (err) return next(err)
    chats = chats.map(JSON.parse)
    cb(null, chats)
  })
}

// user actions

Room.prototype.chatBy = function(user, message, cb) {
  var ev = {
    type: 'chat',
    message: message,
    user: user,
    time: new Date(),
  }
  this.emit('broadcast', ev)
  redis.rpush(this.key('chat'), JSON.stringify(ev), cb)
}

Room.prototype.enqueueBy = function(user, track, cb) {
  cb = cb || noop
  var ev = {
    type: 'enqueue',
    track: track,
    user: user,
    time: new Date(),
  }
  this.emit('broadcast', ev)
  redis.rpush(this.key('queue'), JSON.stringify(ev), function(err) {
    if (err) return cb(err)
    cb(null, ev)
  })
}

Room.prototype.skipBy = function(user, cb) {
  this.emit('broadcast', {
    type: 'skip',
    user: user,
  })
}

Room.prototype.visitBy = function(user, cb) {
  cb = cb || noop
  var self = this
  var key = this.key('user', user.id)
  var ttl = 60 * 4 // four minutes
  redis
    .multi()
    .get(key)
    .set(key, true)
    .expire(key, ttl)
    .exec(function(err, multi) {
      if (err) return cb(err)
      if (!multi[0]) {
        self.emit('userJoined', user)
      }
      cb(err)
    })
}


// playback control

Room.prototype.tick = function() {
  if (Date.now() > this.trackEnd) {
    this.emit('trackEnded', this.track)
    this.next()
  }
}

Room.prototype.play = function(track) {
  this.track = track
  this.trackStart = Date.now()
  this.trackEnd = this.trackStart + track.duration
  this.emit('broadcast', {
    type: 'play',
    track: track,
  })
}

Room.prototype.next = function(cb) {
  cb = cb || noop
  var self = this
  redis.lpop(this.name + ':queue', function(err, data) {
    if (err) return cb(err)
    if (!data) return noTrack()
    data = JSON.parse(data)
    self.play(data.track)
    cb(null, data)
  })
  function noTrack() {
    self.track = self.trackStart = self.trackEnd = undefined
    self.emit('queueEmpty')
    cb()
  }
}
