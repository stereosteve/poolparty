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

// soundcloud wrapper
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

  sc.clearCache = function() {
    cache.removeAll()
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

  sc.put = function(path, params) {
    var deferred = $q.defer()
    SC.put(path, params, makeResolver(deferred))
    return deferred.promise
  }

  sc.delete = function(path) {
    var deferred = $q.defer()
    SC.delete(path, makeResolver(deferred))
    return deferred.promise
  }

  function makeResolver(deferred) {
    return function(data, error) {
      if (error) {
        deferred.reject(error)
      } else {
        sc.clearCache()
        deferred.resolve(data)
      }
      $rootScope.$apply()
    }
  }

  return sc;
})

//
// Controllers
// ===========
//

PP.controller('rootCtrl', function($scope, sc, $location, $http, $route) {
  $scope.playTrack = function(track) {
    $http.post(BASE + '/queue', {trackId: track.id})
  }
  $scope.showUser = function(user) {
    $location.path('/users/' + user.id)
  }
  $scope.scRefresh = function() {
    sc.clearCache()
    $route.reload()
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

PP.controller('userCtrl', function($scope, user, sc, $routeParams, $location) {
  $scope.user = user
  $scope.tab = $routeParams.tabName || 'tracks'
  $scope.showTab = function(tabName) {
    var newPath = ['users', user.id, tabName].join('/')
    $location.path(newPath)
  }
  var path = ['/users', user.id, $routeParams.tabName].join('/')
  var data = $scope[$routeParams.tabName] = []

  function fetchPage() {
    sc.get(path, {offset: data.length}).then(function(page) {
      page.forEach(function(datum) {
        data.push(datum)
      })
      if (page.length > 0) fetchPage()
    })
  }
  fetchPage()

  var followingsPath = '/me/followings/' + user.id
  // The SC followings endpoint is weird.
  // It returns a 404 if you are not following.
  // If you are following it sends a 303, which jQuery follows but without
  // a token, so you eventually get a 401.
  // So a 404 means not following, and anything else means following.
  //
  if (user.id !== $scope.currentUser.id) {
    sc.get(followingsPath).then(function() {}, function(err) {
      if (err.message.indexOf('404') > -1) {
        // not following
        $scope.isFollowing = false
        console.log('not following')
      } else {
        // following
        $scope.isFollowing = true
        console.log('following')
      }
    })
  }
  $scope.follow = function() {
    sc.put(followingsPath).then(function() {
      $scope.isFollowing = true
    })
  }
  $scope.unfollow = function() {
    sc.delete(followingsPath).then(function() {
      $scope.isFollowing = false
    })
  }
})


//
// Directives
// ==========
//

PP.directive('ppPlayer', function(sc) {
  return {
    templateUrl: '/html/ppPlayer.html',
    link: link,
  }
  function link($scope) {
    $scope.like = function() {
      sc.put(likeUrl()).then(
        function(ok) {
          $scope.$root.isLiked = true
        },
        function(err) {
          console.error('like failed', err)
        }
      )
    }
    $scope.unlike = function() {
      sc.delete(likeUrl()).then(
        function(ok) {
          $scope.$root.isLiked = false
        },
        function(err) {
          console.error('unlike failed', err)
        }
      )
    }
    function likeUrl() {
      return [
        '/users',
        $scope.currentUser.id,
        'favorites',
        $scope.nowPlaying.track.id,
      ].join('/')
    }
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
      var message = replaceURLWithHTMLLinks($scope.item.message)
      $el
      .append(
        $('<td>').addClass('name').text($scope.item.user.username)
      )
      .append(
        $('<td>').html(message)
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
    redirectTo: function($routeParams) {
      return ['users', $routeParams.user_id, 'tracks'].join('/')
    }
  })
  .when('/users/:user_id/:tabName', {
    templateUrl: '/html/user.html',
    resolve: {
      user: function(sc, $route) {
        return sc.get('/users/' + $route.current.params.user_id)
      }
    },
    controller: 'userCtrl'
  })
  .when('/', {
    chatMode: true,
    templateUrl: '/html/chat.html',
  })

})


//
// Run
// ===
//

PP.run(function(eventSource, $rootScope, $http, $timeout, sc) {
  $rootScope.chats = []
  $rootScope.memberMap = {}
  $rootScope.currentUser = window.USER
  $rootScope.isMuted = !!localStorage.getItem('isMuted')
  $rootScope.soundcloudId = window.SOUNDCLOUD_ID

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
    $rootScope.nowPlaying = data
  })

  SC.whenStreamingReady(function() {
    console.log('streaming ready!')
  })

  setInterval(stillHere, 5000)
  function stillHere() {
    $.post(BASE + '/still_here')
  }

  $rootScope.$on('$routeChangeSuccess', function(source, current) {
    $rootScope.chatMode = !!current.$$route.chatMode
  })

  $rootScope.$watch('nowPlaying', function(nowPlaying) {
    if (!nowPlaying) return
    $('.loadHead,.playHead').css('width', 0)
    var seeked = false
    var opts = {
      position: serverDate() - nowPlaying.startAt,
      whileloading: function() {
        var percentLoaded = this.bytesLoaded / this.bytesTotal * 100
        $('.loadHead').css('width', percentLoaded + '%')

        var pos = serverDate() - nowPlaying.startAt
        if (!seeked && this.duration > pos) {
          seeked = true
          this.setPosition(pos)
        }
      },
      whileplaying: function() {
        var percentPlayed = this.position / this.durationEstimate * 100
        $('.playHead').css('width', percentPlayed + '%')
        $('.currentPos').text(formatMs(this.position))
      },
      onload: function() {
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
    $rootScope.isLiked = undefined;
    sc.get(nowPlaying.track.uri).then(function(track) {
      $rootScope.isLiked = track.user_favorite
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

// http://stackoverflow.com/questions/37684/how-to-replace-plain-urls-with-links
function replaceURLWithHTMLLinks(text) {
  var exp = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
  return text.replace(exp,"<a href='$1' target='_blank'>$1</a>");
}
