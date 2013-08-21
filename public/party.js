var PARTY = angular.module('party', ['ngRoute'])

PARTY.run(function(sc) {
  console.log('party time')
})

PARTY.factory('sc', function($rootScope, $q) {
  var sc = {}

  sc.login = function() {
    if (resumeSession()) return
    SC.connect(function() {
      onLogin()
    });
  }

  sc.logout = function() {
    SC.accessToken(null)
    localStorage.removeItem('scToken')
    $rootScope.scUser = null
  }

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

  function resumeSession() {
    var token = localStorage.getItem('scToken')
    if (!token) return
    SC.accessToken(token)
    onLogin()
    return true
  }
  function onLogin() {
    localStorage.setItem('scToken', SC.accessToken())
    SC.get('/me', function(me) {
      console.log('Welcome:', me);
      $rootScope.scUser = me
      $rootScope.$apply()
    });
  }

  resumeSession()
  return sc;
})

PARTY.controller('root', function($scope, sc, $location) {
  $scope.login = function() {
    sc.login()
  }
  $scope.logout = function() {
    sc.logout()
  }
  $scope.playTrack = function(track) {
    console.log('plackTrack', track)
    SC.stream(track.stream_url, {
      ontimedcomments: function(comments){
        console.log(comments[0].body);
      }
    }, function(sound) {
      soundManager.stopAll()
      sound.play()
    });
  }
  $scope.showUser = function(user) {
    $location.path('/users/' + user.id)
  }
})

PARTY.filter('debug', function() {
  return function(obj) {
    return JSON.stringify(obj, undefined, 2)
  }
})

PARTY.controller('userCtrl', function($scope, user, sc) {
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
})


PARTY.config(function($routeProvider, $locationProvider) {
  // $locationProvider.html5Mode(true)

  $routeProvider
  .when('/me', {
    templateUrl: '/html/me.html',
  })
  .when('/users/:user_id', {
    templateUrl: '/html/user.html',
    resolve: {
      user: function(sc, $route) {
        return sc.get('/users/' + $route.current.params.user_id)
      }
    },
    controller: 'userCtrl'
  })
  .when('/tracks', {
    templateUrl: '/html/tracks.html',
    resolve: {
      tracks: function(sc) {
        return sc.get('/me/tracks')
      }
    },
    controller: function($scope, tracks) {
      $scope.tracks = tracks
    }
  })
  .when('/followers', {
    templateUrl: '/html/followers.html',
    resolve: {
      followers: function(sc) {
        return sc.get('/me/followers')
      }
    },
    controller: function($scope, followers) {
      $scope.followers = followers
    }
  })
  .when('/followings', {
    templateUrl: '/html/followings.html',
    resolve: {
      followings: function(sc) {
        return sc.get('/me/followings')
      }
    },
    controller: function($scope, followings) {
      $scope.followings = followings
    }
  })

})
