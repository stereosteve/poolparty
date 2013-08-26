# Pool Party

Chat room + music.

## Concepts

**room**

A chat room

* `room.users` - list of users in room
* `room.queue` - list of queued tracks
* `room.currentTrack` - now playing track

Methods

* `room.skipBy(user)`
* `room.joinBy(user)`

Events

* `room.emit('buffer', track)`
* `room.emit('play', track)`
* `room.emit('join', user)`
* `room.emit('leave', user)`
* `room.emit('queue', track)`
* `room.emit('skip', track)`
* `


## TODO

* server needs to track playback - start next song when one ends
