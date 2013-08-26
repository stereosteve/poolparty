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

  describe('queue', function() {
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
      room.on('queueEmpty', function() {
        console.log('le queue is empty')
        done()
      })
    })
  })
})
