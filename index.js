"use strict";

var pumpify = require("pumpify");
var split = require("split2");
var map = require("through2-map");
var padleft = require("pad-left");
var padright = require("pad-right");
var lpad = require("lpad");
var omit = require("lodash.omit");
var yaml = require("yamljs");
var find = require("array-find");
var http = require("http");
var parseHeader = require("./parse-http-header");
var chalk = require("chalk");

var levels = {
  'trace': 10,
  'debug': 20,
  'info': 30,
  'warn': 40,
  'error': 50,
  'fatal': 60
};

var INDENT = "  ";

function getLevelName(level) {
  return find(Object.keys(levels), function(name) {
    return level <= levels[name];
  });
}

function formatLevel(level) {
  var name = getLevelName(level);
  if (level < 30) {
    // trace and debug get no color
    return chalk.white(name);
  }
  else if (level < 40) {
    // info
    return chalk.blue(name);
  }
  else if (level < 50) {
    // warn
    return chalk.magenta(name);
  }
  else {
    // Errors and fatals
    return chalk.bgRed.black(name);
  }
}

function formatJSONLog(obj) {
  var message = obj.msg || "";
  var isShortMessage = message.length <= 60 && message.indexOf("\n") === -1;

  var retval = [];

  if (obj.time != null) {
    retval.push(formatTime(obj.time));
  }

  if (obj.hostname != null) {
    retval.push(" ");
    retval.push(obj.hostname);
  }

  if (obj.pid != null) {
    retval.push("#");
    retval.push(obj.pid);
  }

  if (obj.level != null) {
    retval.push(" ");
    retval.push(padright(formatLevel(obj.level), 5, " "));
  }

  if (obj.name) {
    retval.push(" ");
    retval.push(formatName(obj.name));
  }

  if (isShortMessage) {
    retval.push(" ");
    retval.push(formatMessage(message));
  }

  if (obj.duration) {
    retval.push(" ");
    retval.push(formatDuration(obj.duration));
    retval.push("\n");
  }
  else {
    retval.push("\n");
  }

  if ( ! isShortMessage) {
    retval.push(lpad(message, INDENT));
    retval.push("\n");
  }

  if (obj.req) {
    retval.push(lpad(formatReq(obj.req), INDENT));
    retval.push("\n");
  }

  if (obj.res) {
    retval.push(lpad(formatRes(obj.res), INDENT));
    retval.push("\n");
  }

  if (obj.err) {
    retval.push(lpad(formatError(obj.err), INDENT));
    retval.push("\n");
  }

  var metadata = getMetadata(obj);
  if ( ! isEmpty(metadata)) {
    retval.push(lpad(formatObject(metadata), INDENT));
  }

  return retval.filter(Boolean).join("");
}

function formatError(err) {
  var retval = [];
  if (err.stack) {
    retval.push(err.stack.toString());
  }
  else {
    retval.push("Error: ");
    retval.push(err.message || err.name);
  }
  var props = omit(err, [
    "stack",
    "message",
    "name",
  ]);
  if ( ! isEmpty(props)) {
    retval.push(formatObject(props));
  }
  return retval.filter(Boolean).join("");
}

function formatBytes(bytes) {
  return Math.round(bytes / 1024) + chalk.dim("kB");
}

function formatReq(req) {
  var retval = [];
  retval.push(req.method);
  retval.push(" ");
  retval.push((req.originalUrl || req.url || req.path));
  var headers = getHeaders(req);
  var length = getContentLength(headers);
  if (length != null) {
    retval.push(" ");
    retval.push(formatBytes(length));
  }
  return retval.join("");
}

function getContentLength(headers) {
  if (headers && headers["content-length"]) {
    var length = parseInt(headers["content-length"]);
    if ( ! isNaN(length)) {
      return length;
    }
  }
}

function formatRes(res) {
  var retval = [];
  retval.push(formatStatusCode(res.statusCode));
  retval.push(" ");
  retval.push(http.STATUS_CODES[res.statusCode]);
  var headers = getHeaders(res);
  var length = getContentLength(headers);
  if (length != null) {
    retval.push(" ");
    retval.push(formatBytes(length));
  }
  return retval.join("");
}

function formatStatusCode(statusCode) {
  if (statusCode >= 500) {
    return chalk.red(statusCode);
  }
  else if (statusCode >= 400) {
    return chalk.yellow(statusCode);
  }
  else {
    return statusCode;
  }
}

function getHeaders(obj) {
  if (obj.headers) {
    return obj.headers;
  }
  else if (typeof obj.header === "string") {
    return parseHeader(obj.header);
  }
}

function isEmpty(obj) {
  return ! obj || Object.keys(obj).length === 0;
}

function formatObject(obj) {
  return yaml.stringify(obj, null, 2);
}

function getMetadata(obj) {
  return omit(obj, [
    "v",
    "src",
    "level",
    "time",
    "name",
    "hostname",
    "pid",
    "msg",
    "duration",
    "req",
    "res",
    "err",
  ]);
}

function formatDuration(duration) {
  if (typeof duration === "number") {
    return duration + chalk.dim("ms");
  }
}

function formatTime(time) {
  if ( ! time) {
    return;
  }
  var d = new Date(time);
  return padleft(String(d.getHours()), 2, '0') + ":" +
    padleft(String(d.getMinutes()), 2, '0') + "." +
    padleft(String(d.getMilliseconds()), 3, '0');
}

function formatMessage(message) {
  return chalk.yellow(message);
}

function formatName(name) {
  return name
    .split(":")
    .map(function(name) {
      return chalk.cyan(name);
    })
    .join(":");
}

function formatLine(line) {
  // Check if first byte is ascii "{"
  if (line.length !== 0 && line[0] === 0x7b) {
    // Looks like json, try to parse
    var obj = tryJSONParse(line.toString());
    if (obj) {
      return formatJSONLog(obj);
    }
  }

  // If we failed to parse a json object, leave the line as-is
  return line + "\n";
}

function tryJSONParse(data) {
  try {
    return JSON.parse(data);
  }
  catch(err) {
  }
}

module.exports = function() {
  return pumpify([
    split(),
    map(formatLine),
  ]);
};
