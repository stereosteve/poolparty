
/**
 * Module dependencies.
 */

var express = require('express')
  , http = require('http')
  , path = require('path')
  , sse = require('connect-sse')
  , EventEmitter = require('events').EventEmitter

var app = express();
var bus = new EventEmitter();

// all environments
app.set('port', process.env.PORT || 9000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser('your secret here'));
app.use(express.session());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', function(req, res) {
  res.render('index')
});

app.get('/events', sse(), function(req, res) {
  var onTick = function() {
    res.json({serverDate: new Date()});
  }
  bus.on('tick', onTick)
  req.on('close', function() {
    bus.removeListener('tick', onTick)
  })
})

setInterval(function() {
  bus.emit('tick')
}, 1000);

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
