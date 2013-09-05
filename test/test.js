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

  it('key()', function() {
    var k = room.key('user', 12345)
    assert.equal(k, 'testroom:user:12345')
  })

  it('emits trackEnded event', function(done) {
    room.play({
      track: track
    })
    assert.equal(track.duration, 200)
    room.once('trackEnded', function(track) {
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
        done()
      })
    })
  })

  describe('visitBy', function() {
    it('broadcasts userJoined the first time', function(done) {
      room.once('broadcast', function(ev) {
        assert.equal(ev.type, 'memberJoined')
        assert.equal(ev.member.user.id, user.id)
        done()
      })
      room.visitBy(user)
    })
    it('has one user', function(done) {
      var memberCount = Object.keys(room.memberMap).length
      assert.equal(memberCount, 1)
      done()
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
