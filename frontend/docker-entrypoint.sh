#!/bin/sh
envsubst '${VITE_URL_MZPEDIA}' < /usr/share/nginx/html/env.js.template > /usr/share/nginx/html/env.js
exec nginx -g 'daemon off;'
