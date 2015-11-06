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
var useragent = require("useragent");
chalk.enabled = true;

// Terminology:
//
//  * "Get": Return a raw JS value for something (e.g., `getUrl()`).
//  * "Format": Pretty-print a value to be human-readable (e.g.,
//     formatTime()) — sometimes also includes styling.
//  * "Style": Add styling (color, etc.) to a formatted value.
//

// ## Utility

function isEmpty(obj) {
  return ! obj || Object.keys(obj).length === 0;
}

function formatObject(obj) {
  return yaml.stringify(obj, null, 2).slice(0, -1);
}

// ## String Manipulation
//

var INDENT = "  ";

function indent(str) {
  return lpad(str, INDENT);
}

// Small wrapper around Array#join
function join(parts, seperator) {
  if (seperator == null) {
    seperator = "";
  }
  return parts.filter(Boolean).join(seperator);
}

// ## Log Levels
//

var levels = {
  'trace': 10,
  'debug': 20,
  'info': 30,
  'warn': 40,
  'error': 50,
  'fatal': 60
};

function getLevelName(level) {
  return find(Object.keys(levels), function(name) {
    return level <= levels[name];
  });
}

// ## Text Style (color)
//

function styleLevel(level, name) {
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
    // jjj
    return chalk.bgRed.black(name);
  }
}


// ## Format
//

function formatJSONLog(obj) {
  var message = obj.msg || "";
  var isShortMessage = message.length <= 20 && message.indexOf("\n") === -1;
  var levelName = getLevelName(obj.level);
  var styledLevelName = styleLevel(obj.level, levelName);
  var metadata = getMetadata(obj);

  var retval = [];

  var a = join([
    // Timestamp
    (obj.time != null) && formatTime(obj.time),
    // Hostname and PID
    join([obj.hostname, obj.pid], "#"),
    // Level
    (obj.level != null) && padright(styledLevelName, 5, " "),
    // Name
    obj.name &&
      obj.name.split(":")
      .map(function(name) {
        return chalk.cyan(name);
      })
      .join(":"),
    // Message
    isShortMessage && chalk.yellow(message),
    // Duration
    (typeof obj.duration === "number") && (obj.duration + chalk.dim("ms")),
  ], " ");

  var b = indent(join([
    ( ! isShortMessage) && message,
    obj.req && formatReq(obj.req),
    obj.res && formatRes(obj.res),
    obj.err && formatError(obj.err),
    ( ! isEmpty(metadata)) && formatObject(metadata),
  ], "\n"));

  retval.push(join([
    a,
    b,
  ], "\n"));

  return join(retval, "") + "\n";
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

// ### Error

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

// ### Bytes
//

function formatBytes(bytes) {
  if (bytes <= 1024) {
    return Math.round(bytes) + chalk.dim("B");
  }
  else {
    return Math.round(bytes / 1024) + chalk.dim("kB");
  }
}

// ### HTTP Req & Res
//

function formatReq(req) {
  var headers = getHeaders(req);
  var userAgent = headers && headers["user-agent"];
  return join([
    // method + url + content desc
    join([
      styleMethod(req.method),
      chalk.bold(getUrl(req)),
      formatContentDesc(headers), // type + encoding + size
    ], " "),
    indent(join([
      formatRemoteDesc(userAgent, req.remoteAddress), // ua + ip
      formatHeaders(headers),
    ], "\n")),
  ], "\n");
}

function styleMethod(method) {
  if (method === "GET" || method === "HEAD") {
    return chalk.cyan(method);
  }
  else {
    return chalk.yellow(method);
  }
}

function formatRes(res) {
  var headers = getHeaders(res);
  var statusText = http.STATUS_CODES[res.statusCode];
  return join([
    // method + url + content desc
    join([
      styleStatusCode(res.statusCode),
      chalk.dim(statusText),
      formatContentDesc(headers), // type + encoding + size
    ], " "),
    indent(formatHeaders(headers)),
  ], "\n");
}

function styleStatusCode(statusCode) {
  if (statusCode >= 500) {
    return chalk.red(statusCode);
  }
  else if (statusCode >= 400) {
    return chalk.yellow(statusCode);
  }
  else {
    return chalk.green(statusCode);
  }
}

function getUrl(req) {
  return req.originalUrl || req.url || req.path;
}

// #### "Remote Description"
//
// User Agent + IP
//

function formatRemoteDesc(userAgent, remoteAddress) {
  var uaDesc = formatUA(userAgent);
  return join([
    uaDesc,
    remoteAddress,
  ], "; ");
}

// User Agent
function formatUA(userAgentString) {
  var parsed = useragent.lookup(userAgentString);
  if (parsed.family !== "Other") {
    return join([
      parsed.toAgent(),
      parsed.os.family !== "Other" && parsed.os.toString(),
      parsed.device.family !== "Other" && parsed.device.toString(),
    ], "; ");
  }
  else {
    return parsed.source;
  }
}

// #### "Content Description"
//
// Content Type + Content Encoding + Content Length
//

function formatContentDesc(headers) {
  var length = headers && getContentLength(headers);
  var contentType = headers && headers["content-type"];
  var contentEncoding = headers && headers["content-encoding"];
  return join([
    contentType && chalk.dim(contentType),
    contentEncoding && chalk.dim(contentEncoding),
    (length != null) && formatBytes(length),
  ], "; ");
}

function getContentLength(headers) {
  if (headers && headers["content-length"]) {
    var length = parseInt(headers["content-length"]);
    if ( ! isNaN(length)) {
      return length;
    }
  }
}

// #### HTTP Headers
//

function getHeaders(reqOrRes) {
  if (reqOrRes.headers) {
    return reqOrRes.headers;
  }
  else if (typeof reqOrRes.header === "string") {
    return parseHeader(reqOrRes.header);
  }
}

function formatHeaders(headers) {
  headers = omit(headers, [
    "date",
    "host",
    "connection",
    "content-length",
    "content-ncoding",
    "transfer-encoding",
    "origin",
    "user-agent",
    "content-type",
    "etag",
    "access-control-allow-origin",
    "dnt",
    "x-requested-with",
    // Accept
    "accept",
    "accept-language",
    "accept-encoding",
    "accept-ranges",
    "accept-charset",
    // X-Forwarded
    "x-forwarded-for",
    "x-forwarded-proto",
    "x-forwarded-port",
    // Cookies
    "cookie",
    "set-cookie",
    // Caching
    "pragma",
    "cache-control",
    "if-none-match",
    "if-modified-since",
    "last-modified",
    "vary",
    // CSP
    "content-security-policy",
    "upgrade-insecure-requests",
    // New Relic
    "x-newrelic-id",
    "x-newrelic-transaction",
    "x-newrelic-app-data",
  ]);
  if (headers.referer && headers.referer.length > 63) {
    headers.referer = headers.referer.slice(0, 60) + "...";
  }
  return formatObject(headers);
}

// ### Time
//

function formatTime(time) {
  if ( ! time) {
    return;
  }
  var d = new Date(time);
  return padleft(String(d.getHours()), 2, '0') + ":" +
    padleft(String(d.getMinutes()), 2, '0') + ":" +
    padleft(String(d.getSeconds()), 2, '0') + "." +
    padleft(String(d.getMilliseconds()), 3, '0');
}

// ## Parse & Format Stream
//

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
