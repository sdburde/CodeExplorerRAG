set -e

IMAGE_NAME=esbuild

docker build --tag=$IMAGE_NAME - << EOF
FROM node:lts-alpine
WORKDIR /root
RUN npm install esbuild
RUN npm install react-dom
RUN npm install @msgpack/msgpack
RUN npm install @material/mwc-drawer
RUN npm install @material/mwc-top-app-bar
RUN npm install @material/mwc-icon-button
RUN npm install @material/mwc-list
RUN npm install @material/mwc-icon
RUN npm install @material/mwc-snackbar
RUN npm install @material/mwc-dialog
RUN npm install @material/mwc-circular-progress
RUN npm install @material/mwc-tab-bar
RUN npm install @material/mwc-menu
RUN npm install ag-grid-community@32.3.3
RUN npm install ag-charts-community@10.3.3
RUN npm install @material/mwc-textfield
RUN npm install @material/mwc-slider
EOF

# --sourcemap  --minify
docker run --rm -it -v $PWD:/root/src --workdir=/root/src $IMAGE_NAME \
    /root/node_modules/esbuild/bin/esbuild src/script.jsx \
    --bundle --sourcemap --legal-comments=none --watch --outfile=script.min.js
