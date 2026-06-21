#!/bin/zsh
cd "$(dirname "$0")"

NODE_BIN="$(command -v node)"
if [ -z "$NODE_BIN" ]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi

if [ -z "$NODE_BIN" ]; then
  printf 'Node.jsが見つかりませんでした。Node.jsをインストールしてから、もう一度実行してください。\n'
else
  "$NODE_BIN" update-works-from-instagram.js
fi

printf '\n完了しました。Enterキーを押して閉じます。'
read
