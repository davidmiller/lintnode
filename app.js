#!/usr/bin/env node

'use strict';

/* HTTP interface to JSLint.

   Takes roughly half the time to jslint something with this than to
   start up a new rhino instance on every invocation.

   Invoke from bash script like:

     curl --form source="<${1}" --form filename="${1}" ${JSLINT_URL}

   or use the provided jslint.curl

     jslint.curl <file>

*/

var express = require("express");
var http = require('http');
var jslint = require('./nodelint');
var package_info = require('./package');

var app = express();

app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
app.use(express.bodyParser());

var jslint_port = 3003;
var quiet = false;

// use jslint's default options, by default
var jslint_options = {
};

var outputPrettyErrors = function (filename, errors) {
    var results = ['\n', filename, '\n'];
    errors.forEach(function (e, i) {
        if (e) {
            var pad = '#' + i + ' ';
            while (pad.length < 4) {
                pad = ' ' + pad;
            }
            e.evidence = e.evidence || '';
            results.push(pad, e.reason || '', '\n    ', e.evidence.replace(/^\s*/, ''), ' // Line ', e.line, ', Pos ', e.character, '\n');
        }
    });
    return results.join('');
};

var outputTerseErrors = function (filename, errors) {
    var e, i, output = [];
    // debug("Handling " + errors.length + "errors" + '\n');

    /* This formatting is copied from JSLint's rhino.js, to be compatible with
       the command-line invocation. */
    for (i = 0; i < errors.length; i += 1) {
        e = errors[i];
        if (e) {
            output.push('Lint at line ', e.line,  ' character ', e.character, ': ', e.reason, '\n');
            output.push((e.evidence || '').replace(/^\s*(\S*(\s+\S+)*)\s*$/, "$1"), '\n');
            output.push('\n');
        }
    }
    return filename + '\n' + output.join('');
};

var getOptionString = function () {
    return Object.keys(jslint_options).map(function (opt) {
        return opt + ": " + jslint_options[opt];
    }).join('; ');
};

app.get('/', function (req, res) {
    res.type('text/plain').end('lintnode version: ' + package_info.version + '\n' + 'jslint edition: ' + jslint.edition + '\n' + 'options: ' + getOptionString());
});

app.post('/jslint', function (req, res) {
    if (req.body.source.substr(0, 2) === '#!') {
        /*jslint regexp: true*/
        req.body.source = req.body.source.replace(/^#!.*/, '');
        /*jslint regexp: false*/
    }
    function doLint(sourcedata) {
        var passed, results;
        passed = jslint(sourcedata, jslint_options);
        if (passed) {
            results = "jslint: No problems found in " + req.body.filename + "\n";
        } else {
            if (req.body.pretty) {
                results = outputPrettyErrors(req.body.filename, jslint.errors);
            } else {
                results = outputTerseErrors(req.body.filename, jslint.errors);
            }
        }
        return results;
    }
    res.type('text/plain').end(doLint(req.body.source));
});

/* This action always return some JSLint problems. */
var exampleErrors = function (req, res) {
    jslint("a = function(){ return 7 + x }()",
        jslint_options);
    res.type('text/plain').end(outputTerseErrors('example', jslint.errors));
};

/* This action always returns JSLint's a-okay message. */
var exampleOk = function (req, res) {
    res.type('text/plain').end("jslint: No problems found in example.js\n");
};

app.get('/example/errors', exampleErrors);
app.post('/example/errors', exampleErrors);

app.get('/example/ok', exampleOk);
app.post('/example/ok', exampleOk);

function parseCommandLine() {
    var port_index, exclude_index, exclude_opts, include_index, include_opts, set_index, set_opts, set_pair, help_index, quiet_index;
    port_index = process.argv.indexOf('--port');
    exclude_index = process.argv.indexOf('--exclude');
    include_index = process.argv.indexOf('--include');
    set_index = process.argv.indexOf('--set');
    quiet_index = process.argv.indexOf('--quiet');
    help_index = process.argv.indexOf('--help');
    if (port_index > -1) {
        jslint_port = process.argv[port_index + 1];
    }
    if (exclude_index > -1) {
        exclude_opts = process.argv[exclude_index + 1].split(",");
        if (exclude_opts.length > 0 && exclude_opts[0] !== '') {
            exclude_opts.forEach(function (opt) {
                jslint_options[opt] = false;
            });
        }
    }
    if (include_index > -1) {
        include_opts = process.argv[include_index + 1].split(",");
        if (include_opts.length > 0 && include_opts[0] !== '') {
            include_opts.forEach(function (opt) {
                jslint_options[opt] = true;
            });
        }
    }
    if (set_index > -1) {
        set_opts = process.argv[set_index + 1].split(",");
        if (set_opts.length > 0 && set_opts[0] !== '') {
            set_opts.forEach(function (opt) {
                if (opt.indexOf(":") > -1) {
                    set_pair = opt.split(":");
                    if (set_pair[1] === "true") {
                        set_pair[1] = true;
                    } else if (set_pair[1] === "false") {
                        set_pair[1] = false;
                    }
                    jslint_options[set_pair[0]] = set_pair[1];
                } else {
                    jslint_options[opt] = true;
                }
            });
        }
    }
    if (quiet_index > -1) {
        quiet = true;
    }
    if (help_index > -1) {
        console.error('Usuage:', process.argv[1], '[--port <port>] [--exclude <option,option,...>] [--include <option,option,...>] [--set <option:value,option:value,...>] [--quiet] [--help]');
        console.error('\t--port <port>');
        console.error('\t\tSet the port the server will listen on');
        console.error('\t--exclude <option,option,...>');
        console.error('\t\tShorthand for option:false,option:false,...');
        console.error('\t--include <option,option,...>');
        console.error('\t\tShorthand for option:true,option:true,...');
        console.error('\t--set <option:value,option:value,...>');
        console.error('\t\tSet the options like /*jslint option:value*/');
        console.error('\t--quiet');
        console.error('\t\tDon\'t output diagnostics');
        console.error('\t--help');
        console.error('\t\tThis help');
        process.exit(0);
    }
}

process.on('SIGINT', function () {
    if (!quiet) {
        console.log("\n[lintnode] received SIGINT, shutting down");
    }
    process.exit(0);
});

parseCommandLine();

if (!quiet) {
    console.log('[lintnode] version:', package_info.version);
    console.log('[lintnode] jslint edition:', jslint.edition);
    console.log("[lintnode]", getOptionString());
}

var http_server = http.createServer(app);
http_server.listen(jslint_port, function () {
    if (!quiet) {
        console.log("[lintnode] server running on port", jslint_port);
    }
});
