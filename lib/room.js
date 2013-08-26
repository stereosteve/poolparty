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

Room.prototype.getUserIds = function(cb) {
  var key = [this.name, 'user', '*'].join(':')
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
  var key = [this.name, 'queue'].join(':')
  redis.lrange(key, -100, -1, function(err, data) {
    if (err) return cb(err)
    data = data.map(JSON.parse)
    cb(null, data)
  })
}

// user actions

Room.prototype.enqueueBy = function(user, track, cb) {
  var ev = {
    type: 'enqueue',
    track: track,
    user: user,
    time: new Date(),
  }
  this.emit('broadcast', ev)
  var key = [this.name, 'queue'].join(':')
  redis.rpush(key, JSON.stringify(ev), function(err) {
    if (err) return cb(err)
    cb(null, ev)
  })
}

Room.prototype.visitBy = function(user, cb) {
  cb = cb || noop
  var self = this
  var key = [this.name, 'user', user.id].join(':')
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
}

Room.prototype.next = function(cb) {
  cb = cb || function() {}
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