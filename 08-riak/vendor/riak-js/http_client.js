(function() {
  var Client, EventEmitter, HttpClient, Mapper, Meta, Utils, http;
  var __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; }, __slice = Array.prototype.slice;

  Client = require('./client');

  Meta = require('./http_meta');

  Mapper = require('./mapper');

  Utils = require('./utils');

  http = require('http');

  EventEmitter = require('events').EventEmitter;

  HttpClient = (function() {

    __extends(HttpClient, Client);

    function HttpClient(options) {
      options = options || {};
      options = Utils.mixin(true, {}, Meta.defaults, options);
      this._http = options.http || http;
      HttpClient.__super__.constructor.call(this, options);
    }

    HttpClient.prototype.get = function() {
      var bucket, callback, key, meta, options, _ref;
      bucket = arguments[0], key = arguments[1], options = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      meta = new Meta(bucket, key, options);
      return this.execute('GET', meta, callback);
    };

    HttpClient.prototype.head = function() {
      var bucket, callback, key, meta, options, _ref;
      bucket = arguments[0], key = arguments[1], options = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      meta = new Meta(bucket, key, options);
      return this.execute('HEAD', meta, callback);
    };

    HttpClient.prototype.exists = function() {
      var bucket, callback, key, options, _ref;
      bucket = arguments[0], key = arguments[1], options = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      return this.head(bucket, key, options, function(err, data, meta) {
        if ((meta != null ? meta.statusCode : void 0) === 404) {
          return callback(null, false, meta);
        } else if (err) {
          return callback(err, data, meta);
        } else {
          return callback(err, true, meta);
        }
      });
    };

    HttpClient.prototype.getAll = function() {
      var bucket, callback, mapfunc, options, _ref;
      bucket = arguments[0], options = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      mapfunc = function(v, k, options) {
        var data, keys;
        data = options.noJSON ? Riak.mapValues(v)[0] : Riak.mapValuesJson(v)[0];
        if (options.where && !options.noJSON) {
          keys = [];
          for (var i in options.where) keys.push(i);
          if (keys.some(function(k) {
            return options.where[k] !== data[k];
          })) {
            return [];
          }
        }
        delete v.values;
        return [
          {
            meta: v,
            data: data
          }
        ];
      };
      return this.add(bucket).map(mapfunc, options).run(callback);
    };

    HttpClient.prototype.keys = function() {
      var bucket, callback, meta, options, _ref;
      var _this = this;
      bucket = arguments[0], options = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      meta = new Meta(bucket, void 0, options);
      meta.keys || (meta.keys = true);
      if (meta.keys === 'stream') {
        meta._emitter = new EventEmitter();
        meta._emitter.start = function() {
          return _this.execute('GET', meta, function(err, data, meta) {
            if (meta) delete meta._emitter;
            return callback(err, data, meta);
          });
        };
        return meta._emitter;
      } else {
        return this.get(bucket, void 0, meta, function(err, obj) {
          return callback(err, obj != null ? obj.keys : void 0);
        });
      }
    };

    HttpClient.prototype.count = function() {
      var bucket, buffer, callback, options, stream, _ref;
      bucket = arguments[0], options = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      options.keys = 'stream';
      buffer = [];
      stream = this.keys(bucket, options, function(err, data, meta) {
        return callback(err, buffer.length, meta);
      });
      stream.on('keys', function(keys) {
        var k, _i, _len, _results;
        _results = [];
        for (_i = 0, _len = keys.length; _i < _len; _i++) {
          k = keys[_i];
          _results.push(buffer.push(k));
        }
        return _results;
      });
      return stream.start();
    };

    HttpClient.prototype.walk = function() {
      var bucket, callback, key, linkPhases, map, options, spec, _ref;
      bucket = arguments[0], key = arguments[1], spec = arguments[2], options = 4 <= arguments.length ? __slice.call(arguments, 3) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      linkPhases = spec.map(function(unit) {
        return {
          bucket: unit[0] || '_',
          tag: unit[1] || '_',
          keep: unit[2] != null
        };
      });
      map = options.noJSON ? 'Riak.mapValues' : 'Riak.mapValuesJson';
      return this.add(key ? [[bucket, key]] : bucket).link(linkPhases).reduce({
        language: 'erlang',
        module: 'riak_kv_mapreduce',
        "function": 'reduce_set_union'
      }).map(map).run(options, callback);
    };

    HttpClient.prototype.save = function() {
      var bucket, callback, data, key, meta, options, verb, _ref;
      bucket = arguments[0], key = arguments[1], data = arguments[2], options = 4 <= arguments.length ? __slice.call(arguments, 3) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      meta = new Meta(bucket, key, options);
      meta.data = data || {};
      verb = options.method || (key ? 'PUT' : 'POST');
      return this.execute(verb, meta, callback);
    };

    HttpClient.prototype.remove = function() {
      var bucket, callback, key, meta, options, _ref;
      bucket = arguments[0], key = arguments[1], options = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      meta = new Meta(bucket, key, options);
      return this.execute('DELETE', meta, callback);
    };

    HttpClient.prototype.add = function(inputs) {
      return new Mapper(this, inputs);
    };

    HttpClient.prototype.runJob = function() {
      var callback, options, _ref;
      _ref = this.ensure(arguments), options = _ref[0], callback = _ref[1];
      options.raw || (options.raw = 'mapred');
      return this.save('', '', options.data, options, callback);
    };

    HttpClient.prototype.end = function() {};

    HttpClient.prototype.buckets = function() {
      var callback, meta, options, _ref;
      _ref = this.ensure(arguments), options = _ref[0], callback = _ref[1];
      meta = new Meta('', '', options);
      meta.buckets = true;
      return this.execute('GET', meta, callback);
    };

    HttpClient.prototype.getProps = function() {
      var bucket, callback, options, _ref;
      bucket = arguments[0], options = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      return this.get(bucket, void 0, options, function(err, obj) {
        return callback(err, obj.props);
      });
    };

    HttpClient.prototype.updateProps = function() {
      var bucket, callback, options, props, _ref;
      bucket = arguments[0], props = arguments[1], options = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      options.method = 'PUT';
      return this.save(bucket, void 0, {
        props: props
      }, options, callback);
    };

    HttpClient.prototype.enableIndex = function() {
      var bucket, callback, options, _ref;
      var _this = this;
      bucket = arguments[0], options = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      return this.getProps(bucket, options, function(err, props) {
        var hook;
        hook = {
          mod: 'riak_search_kv_hook',
          fun: 'precommit'
        };
        if (!(props.precommit.some(function(p) {
          return p.mod === hook.mod;
        }))) {
          props.precommit.push(hook);
        }
        return _this.updateProps(bucket, props, options, callback);
      });
    };

    HttpClient.prototype.disableIndex = function() {
      var bucket, callback, options, _ref;
      var _this = this;
      bucket = arguments[0], options = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      return this.getProps(bucket, options, function(err, props) {
        var p;
        props.precommit = (function() {
          var _i, _len, _ref2, _results;
          _ref2 = props.precommit;
          _results = [];
          for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
            p = _ref2[_i];
            if (p.mod !== 'riak_search_kv_hook') _results.push(p);
          }
          return _results;
        })();
        return _this.updateProps(bucket, props, options, callback);
      });
    };

    HttpClient.prototype.search = function() {
      var callback, index, meta, options, query, _ref;
      index = arguments[0], query = arguments[1], options = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      options.raw || (options.raw = 'solr');
      options.rows || (options.rows = 10000);
      options.wt = 'json';
      options.q = query;
      meta = new Meta(index, 'select', options);
      return this.execute('GET', meta, function(err, data, meta) {
        return callback(err, data != null ? data.response : void 0, meta);
      });
    };

    HttpClient.prototype.addSearch = function(index, query) {
      return this.add({
        module: 'riak_search',
        "function": 'mapred_search',
        arg: [index, query]
      });
    };

    HttpClient.prototype.getLarge = function() {
      var callback, key, options, _ref;
      key = arguments[0], options = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      options.raw || (options.raw = 'luwak');
      options.responseEncoding = 'binary';
      return this.get(void 0, key, options, callback);
    };

    HttpClient.prototype.saveLarge = function() {
      var callback, data, key, options, _ref;
      key = arguments[0], data = arguments[1], options = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      options.raw || (options.raw = 'luwak');
      if (data instanceof Buffer) {
        return this.save(void 0, key, data, options, callback);
      } else {
        return callback(new Error('Data has to be a Buffer'));
      }
    };

    HttpClient.prototype.removeLarge = function() {
      var callback, key, options, _ref;
      key = arguments[0], options = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      options.raw || (options.raw = 'luwak');
      return this.remove(void 0, key, options, callback);
    };

    HttpClient.prototype.query = function() {
      var bucket, callback, end, field, key, options, q, type, value, _ref;
      bucket = arguments[0], q = arguments[1], options = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      if (q == null) q = {};
      _ref = this.ensure(options), options = _ref[0], callback = _ref[1];
      options.raw || (options.raw = 'buckets');
      options.doEncodeUri = false;
      field = Object.keys(q)[0];
      value = q[field];
      if (Array.isArray(value)) {
        end = value[1];
        value = value[0];
      }
      type = typeof value === 'number' ? 'int' : 'bin';
      key = "index/" + field + "_" + type + "/" + (encodeURIComponent(value));
      if (end) key += "/" + (encodeURIComponent(end));
      return this.get(bucket, key, options, function(err, data) {
        return callback(err, data != null ? data.keys : void 0);
      });
    };

    HttpClient.prototype.ping = function() {
      var callback, meta, options, _ref;
      _ref = this.ensure(arguments), options = _ref[0], callback = _ref[1];
      meta = new Meta('', '', {
        raw: 'ping'
      });
      return this.execute('HEAD', meta, function(err) {
        return callback(null, !(err != null));
      });
    };

    HttpClient.prototype.stats = function() {
      var callback, meta, options, _ref;
      _ref = this.ensure(arguments), options = _ref[0], callback = _ref[1];
      meta = new Meta('', '', {
        raw: 'stats'
      });
      return this.execute('GET', meta, callback);
    };

    HttpClient.prototype.Meta = Meta;

    HttpClient.prototype.execute = function(verb, meta, callback) {
      var request;
      var _this = this;
      meta.method = verb.toUpperCase();
      meta.headers = meta.toHeaders();
      Client.debug("" + meta.method + " " + meta.path, meta);
      request = this._http.request(meta, function(response) {
        var buffer, bytesRead, firstChunk, size, tempBuffer;
        delete meta.agent;
        size = parseInt(response.headers['content-length']);
        bytesRead = 0;
        buffer = new Buffer(size);
        firstChunk = false;
        tempBuffer = '';
        response.on('data', function(chunk) {
          var head, m, tail;
          if (meta._emitter) {
            if (!firstChunk) {
              buffer = chunk;
              return firstChunk = true;
            } else {
              tempBuffer += chunk;
              m = tempBuffer.match(/\}\{?/);
              if (m != null ? m.index : void 0) {
                head = tempBuffer.substr(0, m.index + 1);
                tail = tempBuffer.substr(m.index + 1);
                tempBuffer = tail;
                try {
                  return meta._emitter.emit('keys', JSON.parse(head).keys);
                } catch (err) {
                  return this.emit('clientError', err);
                }
              }
            }
          } else {
            chunk.copy(buffer, bytesRead, 0);
            return bytesRead += chunk.length;
          }
        });
        return response.on('end', function() {
          var boundary, data, err, _ref;
          if (meta._emitter) meta._emitter.emit('end');
          meta = meta.loadResponse(response);
          buffer = (400 <= (_ref = meta.statusCode) && _ref <= 599) ? (err = new Error("HTTP error " + meta.statusCode + ": " + buffer), meta.statusCode === 404 ? err.message = void 0 : void 0, err.statusCode = meta.statusCode, err) : _this.decodeBuffer(buffer, meta, verb);
          if (meta.statusCode === 300 && meta.contentType.match(/^multipart\/mixed/)) {
            boundary = Utils.extractBoundary(meta.contentType);
            buffer = Utils.parseMultipart(buffer, boundary).map(function(doc) {
              var _meta;
              _meta = new Meta(meta.bucket, meta.key);
              _meta.loadResponse({
                headers: doc.headers,
                statusCode: meta.statusCode
              });
              _meta.vclock = meta.vclock;
              return {
                meta: _meta,
                data: _this.decodeBuffer(doc.body, _meta, verb)
              };
            });
          }
          if (buffer instanceof Error) {
            err = buffer;
            data = buffer.message;
            if ((meta != null ? meta.statusCode : void 0) === 404) {
              if (meta != null ? meta.noError404 : void 0) {
                err = void 0;
                buffer = void 0;
              } else {
                err.notFound = true;
              }
            }
          }
          return callback(err, buffer, meta);
        });
      });
      if (meta.data) {
        request.write(meta.data, meta.contentEncoding);
        delete meta.data;
      }
      request.on('error', function(err) {
        _this.emit('clientError', err);
        return callback(err);
      });
      request.end();
    };

    HttpClient.prototype.decodeBuffer = function(buffer, meta, verb) {
      try {
        if (meta.statusCode === 204 || verb === 'HEAD') {
          return;
        } else if (buffer === "") {
          return buffer;
        } else {
          return meta.decode(buffer);
        }
      } catch (e) {
        return new Error("Cannot convert response into " + meta.contentType + ": " + e.message + " -- Response: " + buffer);
      }
    };

    return HttpClient;

  })();

  module.exports = HttpClient;

}).call(this);