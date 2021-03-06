(function() {
  var EventEmitter, TestServer, Utils, erlangPath, fs, path, spawn, sys, tempPath;
  var __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  sys = require('sys');

  spawn = require('child_process').spawn;

  fs = require('fs');

  path = require('path');

  EventEmitter = require('events').EventEmitter;

  Utils = require('./utils');

  erlangPath = path.normalize("" + __dirname + "/../erl_src");

  tempPath = path.normalize("" + (process.cwd()) + "/.riaktest");

  TestServer = (function() {

    __extends(TestServer, EventEmitter);

    TestServer.defaults = {
      appConfig: {
        riak_core: {
          web_ip: "127.0.0.1",
          web_port: 9000,
          handoff_port: 9001,
          ring_creation_size: 64
        },
        riak_kv: {
          storage_backend: {
            atom: "riak_kv_test_backend"
          },
          pb_ip: "127.0.0.1",
          pb_port: 9002,
          js_vm_count: 8,
          js_max_vm_mem: 8,
          js_thread_stack: 16,
          riak_kv_stat: true
        },
        luwak: {
          enabled: false
        },
        sasl: {
          errlog_type: {
            atom: "error"
          }
        }
      },
      vmArgs: {
        "-name": "riaktest" + (Math.floor(Math.random() * 100000000000)) + "@127.0.0.1",
        "-setcookie": "riak-js-test",
        "+K": true,
        "+A": 64,
        "-smp": "enable",
        "-env ERL_MAX_PORTS": 4096,
        "-env ERL_FULLSWEEP_AFTER": 0,
        "-pa": erlangPath
      },
      tempDir: tempPath
    };

    function TestServer(options) {
      this.options = Utils.mixin(true, {}, TestServer.defaults, options);
      this.options.appConfig.riak_core.ring_state_dir = "" + this.options.tempDir + "/data/ring";
      this.options.binDir = path.normalize(this.options.binDir);
      this.erlangPrompt = new RegExp("^." + this.options.vmArgs['-name'] + ".\\d+>", "m");
    }

    TestServer.prototype.prepare = function(callback) {
      var _this = this;
      if (this.prepared) {
        if (callback) return callback();
      } else {
        return this.createTempDirectories(function() {
          _this.riakScript = "" + _this.temp_bin + "/riak";
          return _this.writeRiakScript(function() {
            return _this.writeVmArgs(function() {
              return _this.writeAppConfig(function() {
                _this.prepared = true;
                if (callback) return callback();
              });
            });
          });
        });
      }
    };

    TestServer.prototype.start = function(callback) {
      var setStarted;
      var _this = this;
      if (this.started) {
        if (callback) return callback();
      } else if (this.prepared && this.listeners('erlangPrompt').length === 0) {
        setStarted = function() {
          _this.started = true;
          if (callback) return callback();
        };
        this.once('erlangPrompt', setStarted);
        this.console = spawn(this.riakScript, ["console"]);
        this.console.stdout.setEncoding("ascii");
        this.console.stderr.setEncoding("ascii");
        this.console.stdout.on('data', function(data) {
          if (data.search(_this.erlangPrompt) !== -1) {
            return _this.emit('erlangPrompt');
          }
        });
        if (this.options.debug) {
          this.console.stderr.on('data', sys.debug);
          this.console.stdout.on('data', sys.debug);
        }
        return process.on('exit', function() {
          if (_this.console) _this.console.kill('SIGKILL');
          return _this.registerStop();
        });
      }
    };

    TestServer.prototype.stop = function(callback) {
      if (!this.started && callback) callback();
      if (this.started && this.listeners('erlangPrompt').length === 0) {
        if (callback) this.console.on('exit', callback);
        this.console.kill('SIGHUP');
        return this.registerStop();
      }
    };

    TestServer.prototype.clear = function(callback) {
      var sendReset, setStarted;
      var _this = this;
      if (this.started && this.listeners('erlangPrompt').length === 0) {
        setStarted = function() {
          _this.started = true;
          if (callback) return callback();
        };
        sendReset = function() {
          _this.once('erlangPrompt', setStarted);
          _this.started = false;
          return _this.console.stdin.write("riak_kv_test_backend:reset().\n", "ascii");
        };
        this.once('erlangPrompt', sendReset);
        return this.console.stdin.write("ok.\n", "ascii");
      }
    };

    TestServer.prototype.registerStop = function() {
      this.removeAllListeners('erlangPrompt');
      delete this.console;
      return this.started = false;
    };

    TestServer.prototype.createTempDirectories = function(callback) {
      var createDir, dir, rmrf, subdirs;
      var _this = this;
      subdirs = (function() {
        var _i, _len, _ref, _results;
        _ref = ['bin', 'etc', 'log', 'data', 'pipe'];
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          dir = _ref[_i];
          _results.push(this["temp_" + dir] = path.normalize("" + this.options.tempDir + "/" + dir));
        }
        return _results;
      }).call(this);
      subdirs.unshift(this.options.tempDir);
      createDir = function() {
        var currDir;
        if (subdirs.length === 0) {
          return callback();
        } else {
          currDir = subdirs.shift();
          return fs.mkdir(currDir, 0700, createDir);
        }
      };
      rmrf = spawn("rm", ["-rf", this.options.tempDir]);
      return rmrf.on('exit', createDir);
    };

    TestServer.prototype.writeRiakScript = function(callback) {
      var inScript, outScript;
      var _this = this;
      outScript = fs.createWriteStream(this.riakScript, {
        encoding: 'utf8',
        mode: 0700
      });
      inScript = fs.createReadStream("" + this.options.binDir + "/riak", {
        encoding: 'utf8'
      });
      inScript.on('error', function(err) {
        sys.debug("error reading from " + inScript.path + ":\n" + (sys.inspect(err, true, null)));
        throw err;
      });
      outScript.on('error', function(err) {
        sys.debug("error writing to " + outScript.path + " script:\n" + (sys.inspect(err, true, null)));
        throw err;
      });
      outScript.on('drain', function() {
        return inScript.resume();
      });
      inScript.on('data', function(data) {
        if (Buffer.isBuffer(data)) data = data.toString('utf8');
        data = data.replace(/(RUNNER_SCRIPT_DIR=)(.*)$/m, "$1" + _this.temp_bin);
        data = data.replace(/(RUNNER_ETC_DIR=)(.*)$/m, "$1" + _this.temp_etc);
        data = data.replace(/(RUNNER_USER=)(.*)$/m, "$1");
        data = data.replace(/(RUNNER_LOG_DIR=)(.*)$/m, "$1" + _this.temp_log);
        data = data.replace(/(PIPE_DIR=)(.*)$/m, "$1" + _this.temp_pipe);
        data = data.replace("RUNNER_BASE_DIR=${RUNNER_SCRIPT_DIR%/*}", "RUNNER_BASE_DIR=" + (path.normalize(_this.options.binDir + '/..')));
        outScript.write(data);
        return inScript.pause();
      });
      return inScript.on('end', function() {
        outScript.end();
        if (callback) return callback();
      });
    };

    TestServer.prototype.writeVmArgs = function(callback) {
      var option, value, vmArgs;
      vmArgs = (function() {
        var _ref, _results;
        _ref = this.options.vmArgs;
        _results = [];
        for (option in _ref) {
          if (!__hasProp.call(_ref, option)) continue;
          value = _ref[option];
          _results.push("" + option + " " + value);
        }
        return _results;
      }).call(this);
      vmArgs = vmArgs.join("\n");
      return fs.writeFile("" + this.temp_etc + "/vm.args", vmArgs, callback);
    };

    TestServer.prototype.writeAppConfig = function(callback) {
      var appConfig;
      appConfig = this.toErlangConfig(this.options.appConfig) + ".";
      return fs.writeFile("" + this.temp_etc + "/app.config", appConfig, callback);
    };

    TestServer.prototype.toErlangConfig = function(object, depth) {
      var key, num, padding, parentPadding, printable, value, values;
      if (depth == null) depth = 1;
      padding = ((function() {
        var _results;
        _results = [];
        for (num = 1; 1 <= depth ? num <= depth : num >= depth; 1 <= depth ? num++ : num--) {
          _results.push('    ');
        }
        return _results;
      })()).join("");
      parentPadding = depth <= 1 ? '' : ((function() {
        var _ref, _results;
        _results = [];
        for (num = 1, _ref = depth - 1; 1 <= _ref ? num <= _ref : num >= _ref; 1 <= _ref ? num++ : num--) {
          _results.push('    ');
        }
        return _results;
      })()).join("");
      values = (function() {
        var _results;
        _results = [];
        for (key in object) {
          if (!__hasProp.call(object, key)) continue;
          value = object[key];
          if (value.atom != null) {
            printable = value.atom;
          } else if (typeof value === 'string') {
            printable = "\"" + value + "\"";
          } else if (value instanceof Object) {
            printable = this.toErlangConfig(value, depth + 1);
          } else {
            printable = value.toString();
          }
          _results.push("{" + key + ", " + printable + "}");
        }
        return _results;
      }).call(this);
      values = values.join(",\n" + padding);
      return "[\n" + padding + values + "\n" + parentPadding + "]";
    };

    TestServer.prototype.once = function(type, listener) {
      var callback;
      var _this = this;
      callback = function() {
        _this.removeListener(type, callback);
        return listener.apply(_this, arguments);
      };
      this.on(type, callback);
      return this;
    };

    return TestServer;

  })();

  module.exports = TestServer;

}).call(this);
