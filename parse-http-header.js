"use strict";

var HTTPParser = require('http-parser-js').HTTPParser;

function getHeadersMap(headers) {
  var retval = {};
  for (var i = 0; i < headers.length / 2; i ++) {
    retval[headers[i * 2].toLowerCase()] = headers[i * 2 + 1];
  }
  return retval;
}

module.exports = function(header) {
  var retval;
  var parser = new HTTPParser(HTTPParser.RESPONSE);
  parser.onHeadersComplete = function(res) {
    retval = getHeadersMap(res.headers);
  };
  parser.onBody =
    parser.onMessageComplete =
    parser.onHeaders =
    function() {};
  parser.execute(new Buffer(header));
  return retval;
};
