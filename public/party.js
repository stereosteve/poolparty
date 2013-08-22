var PP = angular.module('party', ['ngRoute'])


PP.factory('eventSource', function($rootScope) {
  var source = new EventSource('/events');
  source.addEventListener('message', function(e) {
    try {
      var data = JSON.parse(e.data)
    } catch(err) {
      console.error("invalid event json", e.data, err)
    }
    console.log(data);

    if (data._event === 'chat') {
      console.log('got de chat', data)
    }
    else if (data._event === 'play') {
      var track = data.body.track
      SC.stream(track.stream_url, {
        ontimedcomments: function(comments){
          console.log(comments);
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
    $http.post('/play', {track: track})
  }
  $scope.showUser = function(user) {
    $location.path('/users/' + user.id)
  }
  $scope.say = function() {
    $http.post('/chat', {message: $scope.chat})
    $scope.chat = undefined
  }
})

PP.filter('debug', function() {
  return function(obj) {
    return JSON.stringify(obj, undefined, 2)
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
  .when('/tick', {
    template: 'tick tock',
  })

})

PP.run(function(eventSource, $rootScope) {
  $rootScope.currentUser = USER
  console.log('party time')
})
