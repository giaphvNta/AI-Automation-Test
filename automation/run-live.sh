#!/bin/bash
# Start virtual display + VNC for live test viewing at http://localhost:6080/vnc.html
Xvfb :1 -screen 0 1920x1080x24 &
sleep 1
x11vnc -display :1 -nopw -listen localhost -xkb -forever -bg -quiet
websockify --web /usr/share/novnc 6080 localhost:5900 &
sleep 1
exec "$@"
