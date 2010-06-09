Introduction
============

"Monitoring" is a simple web application written in JavaScript and Python.
As its name suggests it is used for monitoring of different system metrics 
(such as CPU and  memory usage, etc) in a real-time.

Basic architecture
==================

 * frontend (web server - Node.js, HTML5, CSS3, Javascript, jquery + jqPlot)
 * backend
   - mon-server.js (monitoring server - Node.js, rrdtool)
   - mon-node.py (monitored node - Python)

Features
--------

 * Monitoring of multiple hosts [done]
 * GUI for choosing monitored host [done]
 * Scroller for choosing plugins
 * More plugins: processes -> threads, improve memory plugin, see munin.
 * Keyboard navigation (arrows - between plots, Ctrl+arrow - between screens)
 * Dynamic axis
