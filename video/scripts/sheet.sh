#!/bin/sh
# Rehearse: a half-size render, then contact sheets (STEP frames apart, 36 per sheet).
#   sh scripts/sheet.sh                       -> the 16:9 cut (Launch)
#   COMP=LaunchVertical sh scripts/sheet.sh   -> the 9:16 cut (8 × 3 portrait cells per sheet)
set -e
cd "$(dirname "$0")/.."
COMP=${COMP:-Launch}
mkdir -p out/rehearse public/rehearse
npx remotion render $COMP out/rehearse/preview.mp4 --scale=0.5 --codec h264 --crf 26 --muted
cp out/rehearse/preview.mp4 public/rehearse/preview.mp4
STEP=${STEP:-10}
TOTAL=$(node -e "const s=require('fs').readFileSync('src/beats.ts','utf8');const n=k=>+s.match(new RegExp(k+' = ([\\\\d.]+)'))[1];console.log(Math.round((n('FIRST_BEAT')+n('END_BEAT')*60/n('BPM'))*30))")
if [ "$COMP" = "LaunchVertical" ]; then COLS=12; ROWS=3; TALL=true; PRE=vsheet; else COLS=6; ROWS=6; TALL=false; PRE=sheet; fi
PER=$((COLS * ROWS))
i=0; from=0
while [ $from -lt $TOTAL ]; do
  npx remotion still Sheet out/rehearse/$PRE-$i.jpg --props="{\"from\":$from,\"step\":$STEP,\"cols\":$COLS,\"rows\":$ROWS,\"tall\":$TALL}" --image-format=jpeg --log=error
  from=$((from + STEP * PER)); i=$((i + 1))
done
ls out/rehearse
