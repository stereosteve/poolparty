process.env.REDIS_DB = '7'
var Redis = require('redis')
var redis = Redis.createClient()
before(function(done) {
  redis.select(process.env.REDIS_DB)
  redis.flushdb(done)
})

var assert = require('assert')
var Room = require('../lib/room')
var room = new Room('testroom')
var track = require('./fixture/track')
var user = require('./fixture/user')

describe('room', function() {
  it.skip('emits trackEnded event', function(done) {
    room.play(track)
    assert.equal(track.duration, 200)
    assert.equal(room.trackEnd, room.trackStart + track.duration)
    room.on('trackEnded', function(track) {
      done()
    })
  })

  describe('enqueueBy', function() {
    before(function(done) {
      room.enqueueBy(user, track, done)
    })
    before(function(done) {
      room.enqueueBy(user, track, done)
    })
    before(function(done) {
      room.enqueueBy(user, track, done)
    })
    it('has 3 items in queue', function(done) {
      room.getQueue(function(err, items) {
        assert.equal(items.length, 3)
        done(err)
      })
    })
    it('next', function(done) {
      room.next()
      room.once('queueEmpty', function() {
        console.log('le queue is empty')
        done()
      })
    })
  })

  describe('visitBy', function() {
    it('broadcasts userJoined the first time', function(done) {
      room.once('userJoined', function(u) {
        assert.equal(u.id, user.id)
        done()
      })
      room.visitBy(user)
    })
    it('does not broadcast userJoined the second time', function(done) {
      room.once('userJoined', function(u) {
        throw("should not broadcast visitBy a second time")
      })
      room.visitBy(user, function() {
        setTimeout(done, 500)
      })
    })
    it('has one user', function(done) {
      room.getUserIds(function(err, ids) {
        assert.equal(ids.length, 1)
        done(err)
      })
    })
  })

  describe('chatBy', function() {
    it('emits a chat event', function(done) {
      room.once('broadcast', function(ev) {
        assert.equal(ev.type, 'chat')
        assert.equal(ev.message, 'First Chat')
        done()
      })
      room.chatBy(user, 'First Chat')
    })
    it('has an item in the chat history', function(done) {
      room.getChats(function(err, data) {
        assert.equal(data.length, 1)
        done(err)
      })
    })
  })

})
