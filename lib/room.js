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
  this.memberMap = {}
  setInterval(this.tick.bind(this), 500)
  this.getNowPlaying()
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
    if (err) return next(err)
    chats = chats.map(JSON.parse)
    cb(null, chats)
  })
}

Room.prototype.getNowPlaying = function(cb) {
  cb = cb || noop
  var self = this
  redis.get(this.key('nowPlaying'), function(err, data) {
    if (err) return cb(err)
    self.nowPlaying = JSON.parse(data)
    return cb(null, self.nowPlaying)
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
    console.log('trackEnded', this.nowPlaying)
    this.emit('trackEnded', this.nowPlaying)
    this.next()
  }

  var self = this
  Object.keys(this.memberMap).forEach(function(memberId) {
    var member = self.memberMap[memberId]
    var diff = Date.now() - member.seenAt
    if (diff > 5000) {
      self.emit('broadcast', {
        type: 'memberLeft',
        id: memberId,
        time: Date.now(),
      })
      self.memberMap[memberId] = undefined
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
  this.emit('broadcast', data)
}

Room.prototype.next = function(cb) {
  cb = cb || noop
  var self = this
  redis.lpop(this.key('queue'), function(err, data) {
    if (err) return cb(err)
    if (!data) return noTrack()
    data = JSON.parse(data)
    self.play(data)
    cb(null, data)
  })
  function noTrack() {
    console.log('queueEmpty')
    self.emit('queueEmpty')
    cb()
  }
}
