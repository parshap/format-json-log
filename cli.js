#!/usr/bin/env node
"use strict";

var pretty = require("./");
var pump = require("pump");

pump(process.stdin, pretty(), process.stdout);

process.on("SIGINT", function() {
  // Ignore SIGINT when reading from stdin
});
