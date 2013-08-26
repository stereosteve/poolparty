var EventEmitter = require('events').EventEmitter
var Redis = require('redis')
var redis = Redis.createClient()

redis.select(9)
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

Room.prototype.tick = function() {
  if (Date.now() > this.trackEnd) {
    console.log('trackEnded', this.track.title)
    this.emit('trackEnded', this.track)
    this.next()
  }
}

Room.prototype.getQueue = function(cb) {
  var key = [this.name, 'queue'].join(':')
  redis.lrange(key, -100, -1, function(err, data) {
    if (err) return cb(err)
    data = data.map(JSON.parse)
    cb(null, data)
  })
}

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

Room.prototype.play = function(track) {
  console.log('play', track.title)
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
