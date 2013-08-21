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

PARTY.controller('root', function($scope, sc) {
  $scope.login = function() {
    sc.login()
  }
  $scope.logout = function() {
    sc.logout()
  }
  $scope.playTrack = function(track) {
    console.log('plackTrack', track)
    SC.stream(track.stream_url, {
      autoPlay: true,
      ontimedcomments: function(comments){
        console.log(comments[0].body);
      }
    });
  }
})

PARTY.filter('debug', function() {
  return function(obj) {
    return JSON.stringify(obj, undefined, 2)
  }
})


PARTY.config(function($routeProvider, $locationProvider) {
  // $locationProvider.html5Mode(true)

  $routeProvider
  .when('/me', {
    templateUrl: '/html/me.html',
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
