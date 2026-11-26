# Asset-only image for compositing with local-web-server
#   docker build -t fastclock-web:assets .

FROM scratch AS assets
COPY index.html app.js style.css paho-mqtt.js config.example.js site.json /site/
COPY fonts /site/fonts
