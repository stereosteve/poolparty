process.env.SOUNDCLOUD_ID = 'a363a0f2b20a24d72e93f9d02b703830'
process.env.SOUNDCLOUD_SECRET = 'ffae43c75407be36492038ce5429a00e'
process.env.COOKIE_SECRET = 'yoe8iqysbijf85x'

/**
 * Module dependencies.
 */

var express = require('express')
  , http = require('http')
  , path = require('path')
  , sse = require('connect-sse')
  , EventEmitter = require('events').EventEmitter
  , authom = require('authom')

var app = express();

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
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser(process.env.COOKIE_SECRET));
app.use(express.session({store: sessionStore}));
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

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

// endpoints



app.get('/', function(req, res) {
  res.render('index')
});

app.get("/auth/:service", authom.app)

app.get('/channel/:channelName', function(req, res) {
  req.session.channelName = req.params.channelName
  res.render('index')
});

app.get('/me', loginRequired, function(req, res) {
  res.json(req.session.user)
})

app.get('/logout', function(req, res) {
  req.session.destroy(function(err) {
    if (err) return next(err);
    res.send('you are logged out');
  });
})

app.post('/chat', function(req, res) {
  var chan = getChannel(req.session.channelName)
  var ev = {
    _event: 'chat',
    message: req.body.message,
    user: req.session.user,
  }
  chan.emit('ev', ev)
  res.send('ok')
})

app.get('/events', sse(), function(req, res) {
  var chan = getChannel(req.session.channelName)
  var onEv = function(ev) {
    res.json(ev)
  }
  chan.on('ev', onEv)
  req.on('close', function() {
    chan.removeListener('ev', onEv)
  })
})

http.createServer(app).listen(app.get('port'), function(){
  console.log('port: ' + app.get('port'));
});
