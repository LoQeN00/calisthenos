#!/bin/sh
# Container entrypoint — runs as root just long enough to fix the mounted
# volume's permissions, then drops to the unprivileged `node` user.
#
# Why: Railway (and many container hosts) mount persistent volumes as
# root:root by default. Anything baked into /data at image-build time gets
# shadowed by the mount, so the `chown` in the Dockerfile is wasted. Without
# this hop, the app — running as `node` (uid 1000) — gets EACCES the first
# time it tries to mkdir or write under DATA_DIR.
#
# `su-exec` is alpine's lightweight equivalent of `gosu`: drops privileges
# without forking a shell, so signals (SIGTERM from the platform) reach the
# Node process directly via tini.

set -e

DATA_DIR="${DATA_DIR:-/data}"

# Best-effort: if /data exists, make sure node owns it. We swallow errors so
# the container still boots if /data isn't a Linux-permission-able mount
# (e.g. some shared filesystems return EPERM on chown). Upload failures will
# then surface as a clean UploadError instead of a 500 (see file-uploads.ts).
if [ -d "$DATA_DIR" ]; then
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
fi

# Drop privileges and exec the original command.
exec su-exec node:node "$@"
