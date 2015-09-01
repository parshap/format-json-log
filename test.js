"use strict";

var fs = require("fs");
var test = require("tape");
var pretty = require("./");
var concat = require("concat-stream");
var split = require("split2");
var through = require("through2");
var spy = require("through2-spy");

function toArray(cb) {
  var arr = [];
  var s = spy(function(val) {
    arr.push(val);
  });
  s.on("end", function() {
    cb(arr);
  });
  s.resume();
  return s;
}

function read() {
  return fs.createReadStream(__dirname + "/test.log", {
    encoding: "utf8",
  });
}

test("should end with a newline", function(t) {
  read()
    .on("error", t.ifError)
    .pipe(pretty())
    .on("error", t.ifError)
    .pipe(concat(function(data) {
      t.ok(data);
      t.equal(data.toString().slice(-1), "\n");
      t.end();
    }));
});

test("should handle non-json lines", function(t) {
  var p = pretty();
  p.pipe(split()).pipe(toArray(function(arr) {
    t.equal(arr[0].toString(), "foo bar");
    t.end();
  }));
  p.write("foo bar\n");
  p.end();
});
