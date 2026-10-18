#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for name in "$@"; do
	"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
		--virtual-time-budget=6000 --window-size=1920,900 \
		--screenshot="$PWD/$name.png" "file://$PWD/$name.html" >/dev/null 2>&1
	echo "rendered $name.png"
done
