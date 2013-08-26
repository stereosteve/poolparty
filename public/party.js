var PP = angular.module('party', ['ngRoute'])
var BASE = window.location.pathname


PP.factory('eventSource', function($rootScope) {
  var source = new EventSource(BASE + '/events');
  source.addEventListener('message', function(e) {
    try {
      var data = JSON.parse(e.data)
    } catch(err) {
      console.error("invalid event json", e.data, err)
    }
    console.log(data);

    if (data._event === 'chat') {
      console.log('got de chat', data)
      $rootScope.chats.push(data)
      $rootScope.$apply()
    }
    else if (data._event === 'queue') {
      var track = data.track
      $('.loadHead,.playHead').css('width', 0)
      $rootScope.currentTrack = track
      $rootScope.$apply()
      SC.stream(track.stream_url, {
        ontimedcomments: function(comments){
          console.log(comments);
        },
        whileplaying: function() {
          var percentLoaded = this.bytesLoaded / this.bytesTotal * 100
          var percentPlayed = this.position / this.durationEstimate * 100
          $('.loadHead').css('width', percentLoaded + '%')
          $('.playHead').css('width', percentPlayed + '%')
        }
      }, function(sound) {
        soundManager.stopAll()
        sound.play()
      });
    }

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
})
