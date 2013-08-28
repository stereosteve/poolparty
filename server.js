if (process.env.NODE_ENV === 'production') {
  process.env.SOUNDCLOUD_ID = '1353155f6bb27128358d013cb12e4932'
  process.env.SOUNDCLOUD_SECRET = '1e85455e2b0add423327f75c6137d3ca'
  process.env.PORT = 80
} else {
  process.env.SOUNDCLOUD_ID = 'a363a0f2b20a24d72e93f9d02b703830'
  process.env.SOUNDCLOUD_SECRET = 'ffae43c75407be36492038ce5429a00e'
}
process.env.COOKIE_SECRET = 'yoe8iqysbijf85x'
process.env.REDIS_DB = '9'

/**
 * Module dependencies.
 */

var express = require('express')
  , http = require('http')
  , path = require('path')
  , sse = require('connect-sse')()
  , EventEmitter = require('events').EventEmitter
  , authom = require('authom')
  , superagent = require('superagent')
  , Room = require('./lib/room')

var app = express();

var RedisStore = require('connect-redis')(express);
var sessionStore = new RedisStore({
  db: process.env.REDIS_DB
});

// all environments
app.set('port', process.env.PORT || 9000);
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
  return rooms[name] || makeChannel(name)
}


// middleware

function loginRequired(req, res, next) {
  console.log('loginRequired', req.path)
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
  req.room = getRoom(req.params.roomName)
  next()
})

app.all('/room/:roomName', updatePresence)
app.all('/room/:roomName*', updatePresence)

function updatePresence(req, res, next) {
  next()
  req.room.visitBy(req.session.user)
}

app.get('/room/:roomName', function(req, res, next) {
  res.render('layout', {
    token: req.session.token,
    user: req.session.user,
  })
});

app.get('/room/:roomName/roster', function(req, res, next) {
  req.room.getUserIds(function(err, userIds) {
    if (err) return next(err)
    scGet('/users', {ids: userIds.join(',')}, function(err, r) {
      if (err) return next(err)
      res.status(r.status).json(r.body)
    })
  })
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






function scGet(path, query, cb) {
  var url = 'https://api.soundcloud.com' + path + '.json';
  query.client_id = process.env.SOUNDCLOUD_ID;
  var req = superagent.get(url).query(query);
  if (cb) req.end(cb);
}
