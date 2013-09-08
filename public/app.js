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

//
// Services
// ========
//

PP.factory('eventSource', function($rootScope, $timeout) {
  var source = new EventSource(BASE + '/events');
  var MAX_CHATS_LEN = 100;
  source.addEventListener('message', function(e) {
    var data
    try {
      data = JSON.parse(e.data)
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
    else if (data.type === 'memberJoined') {
      $rootScope.memberMap[data.id] = data.member
    }
    else if (data.type === 'memberLeft') {
      $rootScope.memberMap[data.id] = undefined;
      delete $rootScope.memberMap[data.id]
    }
    else if (data.type === 'chat') {
      addChatItem()
    }
    else if (data.type === 'enqueue') {
      $rootScope.queue.push(data)
    }
    else if (data.type === 'nowPlaying') {
      // Should we assume a play is the next track on the queue?
      // currently necessary because the "preloader" attaches songs
      // to the queue items... so doing
      //  $rootScope.nowPlaying = data
      // would lose the preloaded `sound`
      // Might want to redo preloading implementation, see #13
      $rootScope.nowPlaying = $rootScope.queue.shift()
      addChatItem()
    }

    function addChatItem() {
      $rootScope.chats.push(data);
      if ($rootScope.chats.length > MAX_CHATS_LEN) $rootScope.chats.shift();
      if (chatIsScrolledToBottom()) $timeout(chatScrollBottom);
    }

    console.log(data);
    $rootScope.$apply()

  }, false);

})

PP.factory('sc', function($rootScope, $q, $cacheFactory) {
  var sc = {}

  var cache = $cacheFactory('soundcloudCache');
  var makeCacheKey = function(path, params) {
    params = params || {}
    var key = path
    Object.keys(params).sort().forEach(function(p) {
      key = [key, p, params[p]].join(',')
    })
    return key
  }

  sc.get = function(path, params) {
    var cacheKey = makeCacheKey(path, params)
    var cached = cache.get(cacheKey)
    if (cached) return $q.when(cached)
    var deferred = $q.defer()
    SC.get(path, params, function(data, error) {
      if (error) {
        deferred.reject(error)
      } else {
        cache.put(cacheKey, data)
        deferred.resolve(data)
      }
      $rootScope.$apply()
    })
    return deferred.promise
  }

  return sc;
})

//
// Controllers
// ===========
//

PP.controller('root', function($scope, sc, $location, $http) {
  $scope.playTrack = function(track) {
    $http.post(BASE + '/queue', {trackId: track.id})
  }
  $scope.showUser = function(user) {
    $location.path('/users/' + user.id)
  }
  $scope.skip = function() {
    $http.post(BASE + '/skip')
  }

  $scope.$root.mute = function() {
    $scope.$root.isMuted = true
    $scope.nowPlaying.sound.mute()
    localStorage.setItem('isMuted', true)
  }
  $scope.$root.unmute = function() {
    $scope.$root.isMuted = false
    $scope.nowPlaying.sound.unmute()
    localStorage.removeItem('isMuted')
  }
})

PP.controller('chatCtrl', function($scope, $http, $timeout) {
  $timeout(chatScrollBottom);
  $scope.say = function() {
    $http.post(BASE + '/chat', {message: $scope.chat})
    $scope.chat = undefined
  }
})

PP.controller('userCtrl', function($scope, user, sc) {
  $scope.user = user
  $scope.tab = 'tracks'
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


//
// Directives
// ==========
//

PP.directive('ppPlayer', function() {
  return {
    templateUrl: '/html/ppPlayer.html',
  }
})

PP.directive('ppTrack', function() {
  return {
    templateUrl: '/html/ppTrack.html',
  }
})

PP.directive('ppRoster', function() {
  return {
    templateUrl: '/html/ppRoster.html',
  }
})

PP.directive('ppQueue', function() {
  return {
    templateUrl: '/html/ppQueue.html',
  }
})

PP.directive('ppChatRow', function() {
  return function($scope, $el) {

    var render = {}

    render.chat = function() {
      $el
      .append(
        $('<td>').addClass('name').text($scope.item.user.username)
      )
      .append(
        $('<td>').text($scope.item.message)
      )
    }

    render.nowPlaying = function() {
      $el
      .addClass('nowPlaying')
      .append(
        $('<td>').addClass('name').text('Now Playing')
      )
      .append(
        $('<td>').text($scope.item.track.title)
      )
    }

    var fn = render[$scope.item.type]
    if (fn) fn()
  }

})

PP.directive('ppUserTile', function() {
  return {
    templateUrl: '/html/ppUserTile.html',
  }
})

PP.filter('ms', function() {
  return formatMs
})


//
// Routes
// ======
//

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
  .when('/queue', {
    templateUrl: '/html/queue.html',
  })
  .when('/', {
    templateUrl: '/html/chat.html',
  })

})


//
// Run
// ===
//

PP.run(function(eventSource, $rootScope, $http, $timeout) {
  $rootScope.chats = []
  $rootScope.memberMap = {}
  $rootScope.currentUser = window.USER
  $rootScope.isMuted = !!localStorage.getItem('isMuted')

  $http.get(BASE + '/member_map').success(function(data) {
    $rootScope.memberMap = data
  })
  $http.get(BASE + '/chat_history').success(function(chats) {
    $rootScope.chats = chats
    $timeout(chatScrollBottom);
  })
  $http.get(BASE + '/queue').success(function(data) {
    $rootScope.queue = data
  })
  $http.get(BASE + '/now_playing').success(function(data) {
    // $rootScope.queue = data
    $rootScope.nowPlaying = data
  })

  SC.whenStreamingReady(function() {
    console.log('streaming ready!')
  })

  setInterval(stillHere, 5000)
  function stillHere() {
    $.post(BASE + '/still_here')
  }


  $rootScope.$watch('nowPlaying', function(nowPlaying) {
    if (!nowPlaying) return
    $('.loadHead,.playHead').css('width', 0)
    var opts = {
      ontimedcomments: function(comments){
        console.log(comments);
      },
      whileloading: function() {
        var percentLoaded = this.bytesLoaded / this.bytesTotal * 100
        $('.loadHead').css('width', percentLoaded + '%')
      },
      whileplaying: function() {
        var percentPlayed = this.position / this.durationEstimate * 100
        $('.playHead').css('width', percentPlayed + '%')
        $('.currentPos').text(formatMs(this.position))
      },
      onload: function() {
        var pos = serverDate() - nowPlaying.startAt
        if (!isNaN(pos)) this.setPosition(pos)
        loadNext()
      }
    }
    createSound(nowPlaying, function() {
      soundManager.stopAll()
      nowPlaying.sound.play(opts)
      if ($rootScope.isMuted) nowPlaying.sound.mute()
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

function chatScrollBottom() {
  var chatContainer = document.getElementById('chat-container');
  if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
}

function chatIsScrolledToBottom() {
  var elem = document.getElementById('chat-container');
  if (!elem) return
  // http://stackoverflow.com/questions/876115/how-can-i-determine-if-a-div-is-scrolled-to-the-bottom
  return Math.abs(elem.scrollTop + elem.offsetHeight - elem.scrollHeight) < 5;
}
