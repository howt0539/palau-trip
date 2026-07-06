#!/bin/bash
# 部署 Trislander 帛琉開團報名須知（單檔 HTML）到 CF Pages 專案 trislander-palau
cd "$(dirname "$0")"
TMPDIR=$(mktemp -d)
cp trislander-palau-2027.html "$TMPDIR/index.html"
# 專案不存在才建立；已存在則忽略錯誤
npx wrangler pages project create trislander-palau --production-branch main 2>/dev/null || true
npx wrangler pages deploy "$TMPDIR" \
  --project-name trislander-palau \
  --branch main \
  --commit-message "deploy trislander palau 2027 notice" \
  --commit-dirty=true
rm -rf "$TMPDIR"
