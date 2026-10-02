#!/usr/bin/env bash
# 데모 사이트(Cloudflare Pages, https://construction-site-app-demo.pages.dev)에 배포한다.
#
# Pages 프로젝트는 GitHub 연동이 아니라 직접 업로드 방식이라, main에 푸시해도 자동으로 배포되지 않는다.
# sync-from-source.sh로 원본을 반영하고 커밋·푸시한 뒤 이 스크립트를 실행한다.
#
# 빌드 결과물에 데모 Supabase 프로젝트만 들어갔는지 다시 확인하고 올린다(운영 키 유출 방지).
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_NAME="construction-site-app-demo"
DEMO_REF="$(tr -d '[:space:]' < scripts/demo-project-ref)"

npm run build

refs="$(grep -rhoE 'https://[a-z0-9]+\.supabase\.co' dist | sort -u)"
if [ "$refs" != "https://${DEMO_REF}.supabase.co" ]; then
  echo "빌드 결과물의 Supabase 주소가 데모 프로젝트가 아닙니다. 배포를 중단합니다:" >&2
  echo "$refs" >&2
  exit 1
fi

# wrangler.jsonc(예전 Worker 설정)를 읽지 않도록 임시 폴더에서 올린다
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -r dist "$tmp/dist"
(cd "$tmp" && npx --prefix "$OLDPWD" wrangler pages deploy dist --project-name "$PROJECT_NAME" --branch main --commit-dirty=true)
