var PP = angular.module('party', ['ngRoute'])
var BASE = window.location.pathname

var clockSkew = 0;
function serverDate() {
  return Date.now() - clockSkew
}

function formatMs(ms) {
  if (!ms) return '0:00';
  var hours, minutes, seconds;
  hours = Math.floor(ms / (60 * 60 * 1000));
  minutes = Math.floor((ms / 60000) % 60);
  seconds = Math.floor((ms / 1000) % 60);
  if (hours && minutes < 10) {
    minutes = "0" + minutes;
  }
  if (seconds < 10) {
    seconds = "0" + seconds;
  }
  var arr = [minutes, seconds]
  if (hours) arr.unshift(hours)
  return arr.join(':');
}


PP.factory('eventSource', function($rootScope) {
  var source = new EventSource(BASE + '/events');
  source.addEventListener('message', function(e) {
    try {
      var data = JSON.parse(e.data)
    } catch(err) {
      console.error("invalid event json", e.data, err)
    }

    if (data.type === 'tick') {
      var skew = Date.now() - data.now
      if (skew < clockSkew) {
        clockSkew = skew
        console.log('clockSkew', clockSkew)
      }
      return
    }
    else if (data.type === 'chat') {
      $rootScope.chats.push(data)
    }
    else if (data.type === 'enqueue') {
      $rootScope.queue.push(data)
    }
    else if (data.type === 'nowPlaying') {
      // Should we assume a play is the next track on the queue?
      $rootScope.nowPlaying = $rootScope.queue.shift()
    }

    console.log(data);
    $rootScope.$apply()

  }, false);
})

PP.factory('sc', function($rootScope, $q) {
  var sc = {}

  sc.get = function(path, params) {
    var deferred = $q.defer()
    SC.get(path, params, function(data, error) {
      if (error)
        deferred.reject(error)
      else
        deferred.resolve(data)
      $rootScope.$apply()
    })
    return deferred.promise
  }

  return sc;
})

PP.controller('root', function($scope, sc, $location, $http) {
  $scope.playTrack = function(track) {
    $http.post(BASE + '/queue', {track: track})
  }
  $scope.showUser = function(user) {
    $location.path('/users/' + user.id)
  }
  $scope.skip = function() {
    $http.post(BASE + '/skip')
  }
})

PP.controller('chatCtrl', function($scope, $http) {
  $scope.say = function() {
    $http.post(BASE + '/chat', {message: $scope.chat})
    $scope.chat = undefined
  }
})

PP.controller('userCtrl', function($scope, user, sc) {
  $scope.user = user
  sc.get('/users/' + user.id + '/followers').then(function(data) {
    $scope.followers = data
  })
  sc.get('/users/' + user.id + '/followings').then(function(data) {
    $scope.followings = data
  })
  sc.get('/users/' + user.id + '/tracks').then(function(data) {
    $scope.tracks = data
  })
  sc.get('/users/' + user.id + '/favorites').then(function(data) {
    $scope.favorites = data
  })
})

PP.directive('ppTrack', function() {
  return {
    templateUrl: '/html/track.html',
  }
})

PP.directive('ppUserTile', function() {
  return {
    templateUrl: '/html/userTile.html',
  }
})

PP.filter('ms', function() {
  return formatMs
})


PP.config(function($routeProvider, $locationProvider) {
  // $locationProvider.html5Mode(true)

  $routeProvider
  .when('/users/:user_id', {
    templateUrl: '/html/user.html',
    resolve: {
      user: function(sc, $route) {
        return sc.get('/users/' + $route.current.params.user_id)
      }
    },
    controller: 'userCtrl'
  })
  .when('/player', {
    templateUrl: '/html/player.html',
  })
  .when('/', {
    templateUrl: '/html/chat.html',
  })

})

PP.run(function(eventSource, $rootScope, $http) {
  $rootScope.chats = []
  $rootScope.currentUser = USER
  console.log('party time')
  $http.get(BASE + '/roster').success(function(roster) {
    $rootScope.roster = roster
  })
  $http.get(BASE + '/chat_history').success(function(chats) {
    $rootScope.chats = chats
  })
  $http.get(BASE + '/queue').success(function(data) {
    $rootScope.queue = data
  })
  $http.get(BASE + '/now_playing').success(function(data) {
    // $rootScope.queue = data
    console.log('nowPlaying', data)
    $rootScope.nowPlaying = data
  })

  SC.whenStreamingReady(function() {
    console.log('streaming ready!')
  })


  $rootScope.$watch('nowPlaying', function(nowPlaying) {
    if (!nowPlaying) return
    $('.loadHead,.playHead').css('width', 0)
    var opts = {
      ontimedcomments: function(comments){
        console.log(comments);
      },
      whileloading: function() {
        var percentLoaded = this.bytesLoaded / this.bytesTotal * 100
        console.log('painful loading', percentLoaded)
        $('.loadHead').css('width', percentLoaded + '%')
      },
      whileplaying: function() {
        var percentPlayed = this.position / this.durationEstimate * 100
        $('.playHead').css('width', percentPlayed + '%')
        $('.currentPos').text(formatMs(this.position))
      },
      onload: function() {
        this.setPosition(serverDate() - nowPlaying.startAt)
        loadNext()
      }
    }
    createSound(nowPlaying, function() {
      soundManager.stopAll()
      nowPlaying.sound.play(opts)
      if (nowPlaying.sound.loaded) {
        $('.loadHead').css('width', '100%')
        loadNext()
      }
    })
  })

  function loadNext() {
    var PRELOAD_LIMIT = 3
    var q = $rootScope.queue, next
    for (var i = 0; i < q.length && i < PRELOAD_LIMIT && !next; i++) {
      if (!q[i].sound) next = q[i]
    }
    if (!next) return
    var opts = {
      onload: function() {
        console.log('onload', next)
        loadNext()
      }
    }
    createSound(next, function() {
      next.sound.load(opts)
    })
  }

  function createSound(play, cb) {
    if (play.sound) return cb()
    SC.stream(play.track.stream_url, function(sound) {
      play.sound = sound
      cb()
    });
  }


})
