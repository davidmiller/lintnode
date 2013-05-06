/*jslint nomen: true*/
'use strict';

var vm = require("vm");
var fs = require("fs");

var ctx = vm.createContext();

vm.runInContext(fs.readFileSync(__dirname + "/jslint.js"), ctx);

module.exports = ctx.JSLINT;
