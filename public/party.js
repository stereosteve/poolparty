var PARTY = angular.module('party', ['ngRoute'])

PARTY.run(function(sc) {
  console.log('party time')
})

PARTY.factory('sc', function($rootScope) {
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
    controller: function($scope) {
      SC.get('/me/tracks', function(data) {
        $scope.tracks = data
        $scope.$apply()
      })
    }
  })
  .when('/followers', {
    templateUrl: '/html/followers.html',
    controller: function($scope) {
      SC.get('/me/followers', function(data) {
        $scope.followers = data
        $scope.$apply()
      })
    }
  })
  .when('/followings', {
    templateUrl: '/html/followings.html',
    controller: function($scope) {
      SC.get('/me/followings', function(data) {
        $scope.followings = data
        $scope.$apply()
      })
    }
  })

})
