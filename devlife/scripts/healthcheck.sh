#!/usr/bin/env bash
HOST=${1:-http://localhost:8000}

check() {
    local url="$HOST$1"
    local res
    res=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    if [ "$res" = "200" ]; then
        echo "OK  $url"
    else
        echo "FAIL $url (HTTP $res)"
        return 1
    fi
}

check /health
check /ready
