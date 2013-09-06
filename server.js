require('./config')
var assert = require('assert')
;[
  'SOUNDCLOUD_ID',
  'SOUNDCLOUD_SECRET',
  'REDIS_DB',
  'COOKIE_SECRET',
  'PORT',
].forEach(function(k) {
  assert.ok(process.env[k], 'process.env.' + k + ' is not set')
})

/**
 * Module dependencies.
 */

var express = require('express')
  , http = require('http')
  , path = require('path')
  , sse = require('connect-sse')()
  , EventEmitter = require('events').EventEmitter
  , authom = require('authom')
  , Room = require('./lib/room')

var app = express();

var RedisStore = require('connect-redis')(express);
var sessionStore = new RedisStore({
  db: process.env.REDIS_DB
});

// all environments
app.set('port', process.env.PORT);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(require('stylus').middleware(__dirname + '/public'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser(process.env.COOKIE_SECRET));
app.use(express.session({store: sessionStore}));
app.use(app.router);
app.use(express.errorHandler());



// authom

authom.createServer({
  service: "soundcloud",
  id: process.env.SOUNDCLOUD_ID,
  secret: process.env.SOUNDCLOUD_SECRET
})
authom.on("auth", function(req, res, data) {
  req.session.token = data.token;
  req.session.user = data.data;
  var after = req.session.afterLogin || '/room/main'
  res.redirect(after)
})
authom.on("error", function(req, res, data) {
  console.error("authom error", data);
})


// rooms

var rooms = {}

var getRoom = function(name) {
  rooms[name] = rooms[name] || new Room(name)
  return rooms[name]
}


// middleware

function loginRequired(req, res, next) {
  if (req.session.user) return next()
  req.session.afterLogin = req.url
  res.redirect('/auth/soundcloud')
}

// no auth


app.get('/', function(req, res, next) {
  res.render('home')
});

app.get("/auth/:service", authom.app)

app.get('/logout', function(req, res, next) {
  req.session.destroy(function(err) {
    if (err) return next(err);
    res.redirect('/');
  });
})


// auth

app.get('/whoami', loginRequired, function(req, res, next) {
  res.json(req.session.user)
})

app.all('/room*', loginRequired)

app.all('/room/:roomName*', function(req, res, next) {
  if (req.params.roomName !== 'main') return res.render('closed')
  req.room = getRoom(req.params.roomName)
  next()
})

app.all('/room/:roomName', updatePresence)
app.all('/room/:roomName*', updatePresence)

function updatePresence(req, res, next) {
  req.room.visitBy(req.session.user)
  next()
}

app.get('/room/:roomName', function(req, res, next) {
  res.render('layout', {
    token: req.session.token,
    user: req.session.user,
  })
});

app.get('/room/:roomName/member_map', function(req, res, next) {
  res.json(req.room.memberMap)
})

app.get('/room/:roomName/chat_history', function(req, res, next) {
  req.room.getChats(function(err, data) {
    if (err) return next(err)
    res.json(data)
  })
})

app.get('/room/:roomName/now_playing', function(req, res, next) {
  req.room.getNowPlaying(function(err, data) {
    if (err) return next(err)
    res.json(data)
  })
})

app.get('/room/:roomName/queue', function(req, res, next) {
  req.room.getQueue(function(err, data) {
    if (err) return next(err)
    res.json(data)
  })
})

app.post('/room/:roomName/chat', function(req, res, next) {
  req.room.chatBy(req.session.user, req.body.message)
  res.send('ok')
})

app.post('/room/:roomName/skip', function(req, res, next) {
  req.room.skipBy(req.session.user)
  res.send('ok')
})

app.post('/room/:roomName/queue', function(req, res, next) {
  // XXX: should just be a track id get track from soundcloud
  var track = req.body.track
  req.room.enqueueBy(req.session.user, track)
  res.send('ok')
})

app.post('/room/:roomName/still_here', function(req, res, next) {
  res.send('ok')
})




app.get('/room/:roomName/events', sse, function(req, res, next) {
  var onBroadcast = function(ev) {
    res.json(ev)
  }
  req.room.on('broadcast', onBroadcast)
  req.on('close', function() {
    req.room.removeListener('ev', onBroadcast)
  })
})





// start

http.createServer(app).listen(app.get('port'), function(){
  console.log('port: ' + app.get('port'));
  if (process.send) process.send('online');
});

process.on('message', function(message) {
  if (message === 'shutdown') {
    if (process.send) process.send('offline')
    process.exit(0);
  }
});


