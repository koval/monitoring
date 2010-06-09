#!/usr/bin/env python
"""
An echo client that allows the user to send multiple lines to the server.
Entering a blank line will exit the client.
"""

import os
import socket
import sys
import time

HOST = 'localhost'
PORT = 3001

def send_data(data, verbose=False):
    """ Connect to the monitoring server and send him a data. Returns True in 
        when data was sent of False when there was some problem.
    """
    s = None
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect((HOST, PORT))
    except socket.error, e:
        if s:
            s.close()
        value, message = e.args
        print >> sys.stderr, 'Could not open socket: %s' % message
        return False


    if verbose:
        print 'Connected to the monitoring server at %s:%d' % (HOST, PORT)


    s.send(data)
    s.recv(1024)
    s.close()

    return True

def get_process_number():
    """ Get number of existing processes.
    """
    n = 0
    for i in os.listdir('/proc'):
        fullpath = os.path.join('/proc', i)
        if not os.path.isdir(fullpath):
            continue
        try:
            int(i)
            n += 1
        except:
            continue
    return ('proc', n)

def get_memory_usage():
    """ Return memory usage in kilobytes.
    """
    fields = ['total', 'free', 'core']
    data = {}
    for line in open('/proc/meminfo'):
        field = fields.pop(0)
        value = int(line.split()[1])
        data[field] = value
        if not fields:
            break
    data['user'] = data['total'] - (data['free'] + data['core'])
    return [
        ('mem_core', data['core']), 
        ('mem_user', data['user']), 
        ('mem_free', data['free'])
    ]

def get_cpu_usage():
    """ Return CPU usage as percentage.
    """
    cpu0, cpu1 = open('/proc/stat').readlines()[1:3]
    cpu0 = sum(map(int, cpu0.split()[1:4]))
    cpu1 = sum(map(int, cpu1.split()[1:4]))

    return [
        ('cpu_core0', cpu0),
        ('cpu_core1', cpu1)
    ]

def get_os_name():
    version = open('/proc/sys/kernel/version').read().lower()
    if 'ubuntu' in version:
        return 'ubuntu'
    elif os.path.exists('/etc/SuSE-release'):
        return 'opensuse'

def main():
    c = 1
    os_name = get_os_name()
    while True:
        values = [('os', os_name), ('timestamp', int(time.time()))]
        values.append(get_process_number())
        values.extend(get_memory_usage())
        values.extend(get_cpu_usage())
        data = '\n'.join('%s %s' % (k, v) for k, v in values)
        send_data(data, verbose=True)
        time.sleep(1)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print 'Exiting...'
