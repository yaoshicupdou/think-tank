#!/bin/bash
# 首次启动自动生成 JWT_SECRET，持久化到 /data/jwt_secret 文件
# 若环境变量 JWT_SECRET 已设置则优先使用

JWT_FILE="/data/jwt_secret"

if [ -z "$JWT_SECRET" ]; then
    if [ -f "$JWT_FILE" ]; then
        export JWT_SECRET=$(cat "$JWT_FILE")
    else
        export JWT_SECRET=$(openssl rand -hex 32)
        echo "$JWT_SECRET" > "$JWT_FILE"
        echo ">>> 已自动生成 JWT_SECRET 并保存至 $JWT_FILE"
    fi
fi

exec "$@"
