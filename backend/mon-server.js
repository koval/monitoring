#!/usr/bin/env node
var net = require('net'),
  sys = require('sys'),
  fs = require('fs'),
  spawn = require('child_process').spawn;;

var DBDIR = '../db';
var SUFFIX = '.rrd';

var callRRDTool = function (filename, data, createDB) {
  if (createDB) {
    // create RRD
    var args = ['create', filename, '--start',  Number(data[0])-1, '--step', '1',
      'DS:proc:GAUGE:2:U:U',
      'DS:mem_core:GAUGE:2:U:U',
      'DS:mem_user:GAUGE:2:U:U',
      'DS:mem_free:GAUGE:2:U:U',
      'DS:cpu_core0:DERIVE:2:U:U',
      'DS:cpu_core1:DERIVE:2:U:U',
      'RRA:AVERAGE:0.5:1:180',
    ]
    var rrdtool = spawn('rrdtool', args);
    rrdtool.stdout.setEncoding('utf8');
    rrdtool.stderr.addListener('data', function (data) {
      sys.print('Create failed: ' + data);
    });

    // update RRD after creating it
    rrdtool.addListener('exit', function (code, signal) {
      var args = ['update', filename, data.join(':')];
      var rrdtool = spawn('rrdtool', args);
      rrdtool.stderr.addListener('data', function (data) {
        sys.print('Update failed: ' + data);
      });
    });

  } else {
    // update RRD
    var args = ['update', filename, data.join(':')];
    var rrdtool = spawn('rrdtool', args);
    rrdtool.stderr.addListener('data', function (data) {
      sys.print('Update failed: ' + data);
    });
  }
}

var putData = function (addr, data) {
  var lines = data.split('\n');
  var os = lines[0].split(' ')[1];

  var filename = DBDIR + '/' + addr + '-' + os + SUFFIX;
  var create_db = false;
  try {
    stat = fs.statSync(filename);
  } catch (e) {
    create_db = true;
  }

  var args = [];
  for (var i=1; i<lines.length; i++) {
    args.push(lines[i].split(' ')[1]);
  }
  callRRDTool(filename, args, create_db);
  sys.log('Received new data from ' + addr);
}

var server = net.createServer(function (stream) {
  stream.setEncoding('utf8');
  stream.addListener('connect', function () {
    stream.write('hello ' + stream.remoteAddress + '\r\n');
  });
  stream.addListener('data', function (data) {
    putData(stream.remoteAddress, data);
  });
  stream.addListener('end', function () {
    stream.write('goodbye\r\n');
    stream.end();
  });
});

// listen on port 3001 on all network interfaces
server.listen(3001);
