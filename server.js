process.env.SOUNDCLOUD_ID = 'a363a0f2b20a24d72e93f9d02b703830'
process.env.SOUNDCLOUD_SECRET = 'ffae43c75407be36492038ce5429a00e'
process.env.COOKIE_SECRET = 'yoe8iqysbijf85x'

/**
 * Module dependencies.
 */

var express = require('express')
  , http = require('http')
  , path = require('path')
  , sse = require('connect-sse')()
  , EventEmitter = require('events').EventEmitter
  , authom = require('authom')
  , Redis = require('redis')
  , superagent = require('superagent')

var app = express();
var redis = Redis.createClient();

redis.select(9)
redis.on("error", function (err) {
    console.error("redis error", err);
});

var RedisStore = require('connect-redis')(express);
var sessionStore = new RedisStore({
  db: 9
});

// all environments
app.set('port', process.env.PORT || 9000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
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
  var after = req.session.afterLogin || '/channel/main'
  res.redirect(after)
})
authom.on("error", function(req, res, data) {
  console.error("authom error", data);
})


// channels

var channels = {}

var getChannel = function(name) {
  return channels[name] || makeChannel(name)
}

var makeChannel = function(name) {
  channels[name] = new EventEmitter()
  return channels[name]
}


// middleware

var loginRequired = function(req, res, next) {
  if (req.session.user) return next()
  req.session.afterLogin = req.url
  res.redirect('/auth/soundcloud')
}

// no auth


app.get('/', function(req, res) {
  res.render('home')
});

app.get("/auth/:service", authom.app)

app.get('/logout', function(req, res) {
  req.session.destroy(function(err) {
    if (err) return next(err);
    res.redirect('/');
  });
})


// auth

app.get('/channel/:channelName', loginRequired, function(req, res) {
  var key = ['presence', req.session.user.id, req.params.channelName].join(':')
  var ttl = 1000
  redis
    .multi()
    .set(key, true)
    .expire(key, ttl)
    .exec(function(err, multi) {
      if (err) return next(err)
      console.log('mullllti', multi)
      req.session.channelName = req.params.channelName
      res.render('layout', {
        token: req.session.token,
        user: req.session.user,
      })
    })
});

app.get('/channel/:channelName/roster', loginRequired, function(req, res) {
  // get list of users in this room
  redis.keys('presence:*:' + req.params.channelName, function(err, keys) {
    if (err) return next(err)
    if (keys.length === 0) return res.send([])
    var userIds = keys.map(function(k) {
      return k.split(':')[1]
    })
    scGet('/users', {ids: userIds.join(',')}, function(err, r) {
      res.status(r.status).json(r.body)
    })
  })
})

app.get('/api/me', loginRequired, function(req, res) {
  res.json(req.session.user)
})

app.post('/api/chat', loginRequired, function(req, res) {
  var chan = getChannel(req.session.channelName)
  var ev = {
    _event: 'chat',
    message: req.body.message,
    user: req.session.user,
    time: new Date(),
  }
  chan.emit('ev', ev)
  res.send('ok')
})

app.post('/api/play', loginRequired, function(req, res) {
  var chan = getChannel(req.session.channelName)
  var ev = {
    _event: 'play',
    body: req.body,
    user: req.session.user,
    time: new Date(),
  }
  chan.emit('ev', ev)
  res.send('ok')
})

app.get('/api/events', loginRequired, sse, function(req, res) {
  var chan = getChannel(req.session.channelName)
  var onEv = function(ev) {
    res.json(ev)
  }
  chan.on('ev', onEv)
  req.on('close', function() {
    chan.removeListener('ev', onEv)
  })
})



// start

http.createServer(app).listen(app.get('port'), function(){
  console.log('port: ' + app.get('port'));
});











function scGet(path, query, cb) {
  var url = 'https://api.soundcloud.com' + path + '.json';
  query.client_id = process.env.SOUNDCLOUD_ID;
  var req = superagent.get(url).query(query);
  if (cb) req.end(cb);
}
