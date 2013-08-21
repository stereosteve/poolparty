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
