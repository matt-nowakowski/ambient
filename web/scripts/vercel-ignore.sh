#!/bin/sh
# Vercel's "Ignored Build Step": exit 0 skips the build, exit 1 builds.
# Only main deploys (every other branch push would bill a preview build), and
# only when something the website uses changed since the last deploy.
[ "$VERCEL_GIT_COMMIT_REF" != "main" ] && exit 0
if [ -n "$VERCEL_GIT_PREVIOUS_SHA" ] && git cat-file -e "$VERCEL_GIT_PREVIOUS_SHA^{commit}" 2>/dev/null \
  && git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . ../brand.config.json; then
  exit 0
fi
exit 1
