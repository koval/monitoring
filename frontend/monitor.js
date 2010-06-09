#!/usr/bin/env node
require.paths.unshift(__dirname);
require.paths.unshift(__dirname + '/deps/express/lib')

var sys = require('sys'),
  fs = require('fs'),
  path = require('path');

require('express');
require('express/plugins');
use(Static);
use(Logger);

configure(function(){
  set('root', __dirname)
})

get('/', function(){
  var html = fs.readFileSync('index.html');
  this.respond(200, html);
})

get('/node', function(){
  var text = fs.readFileSync('mon-node.py');
  this.contentType('text')
  this.respond(200, text);
})

var DBDIR = '../db';

get('/hosts', function(){
  this.contentType('json');
  this.respond(200, JSON.stringify(HOSTS));
})

get('/debug', function(){
  this.contentType('json');
  this.respond(200, JSON.stringify({
    xml: XML,
    last_value: LAST_VALUE,
    default_host: DEFAULT_HOST,
    hosts: HOSTS,
  }));
})


/* should be in a separate module */

var spawn = require('child_process').spawn;

var SECONDS = 120,
    MAX_WINDOW = 60,
    INTERVAL = SECONDS + MAX_WINDOW,
    DELAY = 10;

// parse xml and return data series for the last SECONDS seconds
var parse_xml = function (xml) {
    var lines = xml.split('\n');
    var series = [[], [], [], [], [], [], [], []];
    var r = /<v>([^<]+)<\/v>/g;
    for (var i=0; i<lines.length; i++) {
        var line = lines[i];
        if (!r.test(line)) {
            continue;
        }
        r.lastIndex = 0;

        var sid = 0, m, value;
        while ((m = r.exec(line))) {
            if (m[1] !== 'NaN') {
              value = Number(m[1]);
            } else {
              value = -1; // can't use NaN because two non-NaN points will be joined
            }
            series[sid].push(value);
            sid += 1;
        }
    }
    for (var i=0; i<series.length; i++) {
      series[i] = series[i].slice(-SECONDS);
    }
    for (var i=0; i<series.length; i++) {
      for (var j=0; j<series[0].length; j++) {
        series[i][j] = [j+1, series[i][j]]
      }
    }
    return series;
}

var XML = {};
var LAST_VALUE = {};
var DEFAULT_HOST;
var HOSTS = [];

var call_rrdtool = function (filename, start, end) {
  var filepath = path.join(DBDIR, filename);
  var args = ['xport', '--start', start, '--end', end,
      'DEF:proc=' + filepath + ':proc:AVERAGE', 'XPORT:proc:"proc"',
      'DEF:mem_core=' + filepath + ':mem_core:AVERAGE', 'XPORT:mem_core:"mem_core"',
      'DEF:mem_user=' + filepath + ':mem_user:AVERAGE', 'XPORT:mem_user:"mem_user"',
      'DEF:mem_free=' + filepath + ':mem_free:AVERAGE', 'XPORT:mem_free:"mem_free"',
      'DEF:cpu_core0=' + filepath + ':cpu_core0:AVERAGE', 'XPORT:cpu_core0:"cpu_core0"',
      'DEF:cpu_core1=' + filepath + ':cpu_core1:AVERAGE', 'XPORT:cpu_core1:"cpu_core1"',
      'CDEF:cpu_core0_s30=cpu_core0,30,TREND', 'XPORT:cpu_core0_s30:"cpu_core0_s30"',
      'CDEF:cpu_core1_s30=cpu_core1,30,TREND', 'XPORT:cpu_core1_s30:"cpu_core1_s30"',
  ]
  // remove .rrd extension
  var full = filename.slice(0, -4).split('-');
  var host = full[0];
  HOSTS.push(full);

  var rrdtool = spawn('rrdtool', args);
  XML[host] = '';

  rrdtool.stdout.setEncoding('utf8');
  rrdtool.stdout.addListener('data', function (data) {
      XML[host] += data;
  });
  rrdtool.stdout.addListener('end', function () {
      LAST_VALUE[host] = parse_xml(XML[host]);
  });

  rrdtool.stderr.addListener('data', function (data) {
      sys.print('Failed to export ' + filepath + ': ' + data);
  });

}

// query RRD for last INTERVAL seconds
var get_json = function() {
    // compute time bounds
    var end = new Date().getTime(), start;
    end = Math.ceil(end/1000) - DELAY;
    start = end - INTERVAL;
    HOSTS = [];

    // iterate over RRD files and get last data
    var filenames = fs.readdirSync(DBDIR);
    for (var i=0; i<filenames.length; i++) {
      call_rrdtool(filenames[i], start, end);
    }
    HOSTS.sort()
    DEFAULT_HOST = HOSTS[0][0];
}

// do it every second
setInterval(get_json, 1000);
// get_json();

var get_data = function(host, plugin) {
  // when there is no data return empty list
  if (!(host in LAST_VALUE)) {
    return []
  }
  // else return data appropriate for plugin
  if (plugin === 'proc') {
    return LAST_VALUE[host].slice(0, 1);
  } else if (plugin === 'mem') {
    return LAST_VALUE[host].slice(1, 4);
  } else if (plugin === 'cpu') {
    return LAST_VALUE[host].slice(-2);
//     return [LAST_VALUE[6], LAST_VALUE[7], LAST_VALUE[4], LAST_VALUE[5]];
  }
}

/* end of module */

get('/proc', function() {
  var host = this.param('host');
  if (!host) {
    host = DEFAULT_HOST;
  }

  var COLORS = ['#CBE0F8', '#74B3F8', '#0558B4', '#FF9A00']
  var OPTIONS = {
      'title': {
          'text': 'Number of processes',
          'fontSize': '20pt',
          'fontFamily': 'sans-serif',
      },
      'seriesDefaults': {
          'showMarker': false,
          'shadow': false,
          'fillAndStroke': true,
          'fill': true,
          'fillAlpha': '0.6',
      },
      'series': [
          {
              'label': 'Current',
              'color': COLORS[2],
              'lineWidth': 3,
              'fillColor': COLORS[0],
          },
      ],
      'axesDefaults': {
//           'tickRenderer': js_function('$.jqplot.CanvasAxisTickRenderer '),
          'tickOptions': {
              'fontSize': '12pt',
              'fontFamily': 'sans-serif',
              'enableFontSupport': true
          }
      },
      'axes': {
          'xaxis': {
              'min': 1,
              'max': SECONDS,
              'ticks': [[1, '-2min'], [30, '-1.5min'], [60, '-1m'], [90, '-0.5min'], [120, 'now']],
          },
          'yaxis': {
              'rendererOptions': {
                  'tickOptions': {
                      'formatString': '%d'
                  }
              },
              'min': 0,
              'max': 200,
              'tickInterval': 40,
          }
      },
      'legend': {
          'show': false,
      },
      'grid': {
          'background': 'transparent',
      }
  }
  
  var series = get_data(host, 'proc');

  this.contentType('json');
  this.respond(200, JSON.stringify({host: host, data: series, options: OPTIONS}));
})

get('/mem', function(host) {
  var host = this.param('host');
  if (!host) {
    host = DEFAULT_HOST;
  }

  var COLORS = ['#CBE0F8', '#74B3F8', '#0558B4', '#FF9A00']
  var OPTIONS = {
      'title': {
          'text': 'Memory usage',
          'fontSize': '20pt',
          'fontFamily': 'sans-serif',
      },
      'stackSeries': true,
      'seriesDefaults': {
          'showMarker': false,
          'shadow': false,
          'fill': true,
          'fillAlpha': '0.6',
      },
      'series': [
          {
              'label': 'Core',
//               'fillColor': COLORS[2],
          },
          {
              'label': 'User',
//               'fillColor': COLORS[1],
          },
          {
              'label': 'Free',
//               'fillColor': COLORS[2],
          },
      ],
      'axesDefaults': {
//           'tickRenderer': js_function('$.jqplot.CanvasAxisTickRenderer '),
          'tickOptions': {
              'fontSize': '12pt',
              'fontFamily': 'sans-serif',
              'enableFontSupport': true
          }
      },
      'axes': {
          'xaxis': {
              'min': 1,
              'max': SECONDS,
              'ticks': [[1, '-2min'], [30, '-1.5min'], [60, '-1m'], [90, '-0.5min'], [120, 'now']],
          },
          'yaxis': {
              'rendererOptions': {
                  'tickOptions': {
                      'formatString': '%d'
                  }
              },
              'min': 0,
              'max': 4194304,
              'tickInterval': 524288,
              'ticks': [
                  [0, '0'], [524288, '0.5GiB'], 
                  [1048576, '1GiB'],
                  [1572864, '1.5GiB'],
                  [2097152, '2GiB'],
                  [2621440, '2.5GiB'],
                  [3145728, '3GiB'],
                  [3670016, '3.5GiB'],
                  [4194304, '4GiB']
                ]
          }
      },
      'legend': {
          'show': true,
      },
      'grid': {
          'background': 'transparent',
      }
  }
  var series = get_data(host, 'mem');

  this.contentType('json');
  this.respond(200, JSON.stringify({host: host, data: series, options: OPTIONS}));
})

get('/cpu', function(host) {
  var host = this.param('host');
  if (!host) {
    host = DEFAULT_HOST;
  }

  var OPTIONS = {
      'title': {
          'text': 'CPU usage',
          'fontSize': '20pt',
          'fontFamily': 'sans-serif',
      },
      'seriesDefaults': {
          'showMarker': false,
          'shadow': false,
          'fill': true,
          'fillAndStroke': true,
          'fillAlpha': '0.4',
          'lineWidth': 3,
      },
      'series': [
          {
              'label': 'Core #0 (30 seconds avarage)',
//               'fill': true,
              'fillColor': '#EAA228',
              'color': '#EAA228',
          },
          {
              'label': 'Core #1 (30 seconds avarage)',
//               'fill': true,
              'fillColor': '#4BB2C5',
              'color': '#4BB2C5',
          },
          {
              'label': 'Core #0',
//               'fillColor': COLORS[2],
          },
          {
              'label': 'Core #1',
//               'fillColor': COLORS[1],
          },
      ],
      'axesDefaults': {
//           'tickRenderer': js_function('$.jqplot.CanvasAxisTickRenderer '),
          'tickOptions': {
              'fontSize': '12pt',
              'fontFamily': 'sans-serif',
              'enableFontSupport': true
          }
      },
      'axes': {
          'xaxis': {
              'min': 1,
              'max': SECONDS,
              'ticks': [[1, '-2min'], [30, '-1.5min'], [60, '-1m'], [90, '-0.5min'], [120, 'now']],
          },
          'yaxis': {
              'rendererOptions': {
                  'tickOptions': {
                      'formatString': '%d'
                  }
              },
              'min': 0,
              'max': 100,
              'tickInterval': 20,
          }
      },
      'legend': {
          'show': true,
      },
      'grid': {
          'background': 'transparent',
      }
  }
  var series = get_data(host, 'cpu');

  this.contentType('json');
  this.respond(200, JSON.stringify({host: host, data: series, options: OPTIONS}));
})

run()
