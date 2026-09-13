#!/usr/bin/env bash
#
# 운영 저장소의 변경분을 이 포트폴리오 사본으로 가져오고, 공개해도 안전한 상태인지
# 검증한다. 검증에 실패하면 즉시 중단하므로, 통과한 경우에만 커밋·배포하면 된다.
#
#   사용법:  ./scripts/sync-from-source.sh [운영_저장소_경로]
#   기본값:  ../Integrated-Construction-Site-Management-App
#
# 가장 위험한 실수는 운영 .env가 들어간 채로 빌드해 운영 키를 공개 사이트에 싣는 것이다.
# VITE_ 변수는 빌드 시점에 번들로 박히기 때문에 저장소에 .env를 안 올리는 것과는 별개
# 문제다. 그래서 이 스크립트는 빌드 후 번들에 남은 Supabase 주소가 이 폴더의 .env와
# 일치하는지 확인한다(운영 주소를 하드코딩하지 않기 위해 "화이트리스트" 방식을 쓴다).

set -euo pipefail

SRC="${1:-../Integrated-Construction-Site-Management-App}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

fail() { printf '\n[실패] %s\n' "$1" >&2; exit 1; }
step() { printf '\n== %s\n' "$1"; }

[ -d "$SRC" ] || fail "운영 저장소를 찾을 수 없습니다: $SRC"
[ -f .env ]   || fail ".env가 없습니다. 데모 프로젝트 값으로 만들어 주세요."

# ---------------------------------------------------------------------------
step "1/5  운영 저장소에서 소스 복사"

# .env와 .git은 절대 가져오지 않는다. supabase/.temp에는 운영 DB 접속 문자열이 들어 있다.
for path in src supabase package.json package-lock.json vite.config.js index.html CHANGELOG.md; do
  [ -e "$SRC/$path" ] || { echo "  건너뜀(없음): $path"; continue; }
  rm -rf "./$path"
  cp -r "$SRC/$path" "./$path"
  echo "  복사: $path"
done

rm -rf supabase/.temp supabase/.branches
echo "  제거: supabase/.temp, supabase/.branches"

# wrangler.jsonc는 Worker 이름이 달라야 하므로 덮어쓰지 않는다.
echo "  유지: wrangler.jsonc, README.md, docs/img/ (사본 전용)"

# ---------------------------------------------------------------------------
step "2/5  민감 정보 검사 (소스)"

if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  fail ".env가 git에 추적되고 있습니다."
fi

# scripts/는 검사 패턴 자체를 담고 있어 제외한다(자기 자신에 걸리는 것을 막기 위함).
SCAN_EXCLUDES=(--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=dev-dist
               --exclude-dir=scripts --exclude-dir=.git --exclude=.env)

if grep -rIn "${SCAN_EXCLUDES[@]}" -E "sb_secret_[A-Za-z0-9]|service_role_key" . >/dev/null 2>&1; then
  grep -rIn "${SCAN_EXCLUDES[@]}" -E "sb_secret_[A-Za-z0-9]|service_role_key" . >&2
  fail "secret 키로 보이는 문자열이 있습니다."
fi

if [ -e supabase/.temp ]; then
  fail "supabase/.temp가 남아 있습니다(운영 DB 접속 정보 포함 가능)."
fi
echo "  통과"

# ---------------------------------------------------------------------------
step "3/5  빌드"

# 기대하는 데모 프로젝트를 저장소에 고정해두고 대조한다. .env와 번들만 비교하면
# .env 자체가 운영일 때 둘이 일치해버려 정작 막으려던 사고를 놓친다.
# (이 ref는 공개 사이트 번들에 이미 들어 있는 값이라 비밀이 아니다)
[ -f scripts/demo-project-ref ] || fail "scripts/demo-project-ref가 없습니다."
EXPECTED_REF="$(tr -d '[:space:]' < scripts/demo-project-ref)"
[ -n "$EXPECTED_REF" ] || fail "scripts/demo-project-ref가 비어 있습니다."

ENV_REF="$(grep '^VITE_SUPABASE_URL=' .env | sed -E 's#.*https://([a-z0-9]+)\.supabase\.co.*#\1#')"
[ -n "$ENV_REF" ] || fail ".env의 VITE_SUPABASE_URL에서 프로젝트 ref를 읽지 못했습니다."

if [ "$ENV_REF" != "$EXPECTED_REF" ]; then
  fail ".env가 데모 프로젝트를 가리키지 않습니다(${ENV_REF:0:4}****). 운영 .env가 들어와 있지 않은지 확인하세요."
fi
echo "  .env 확인: 데모 프로젝트(${EXPECTED_REF:0:4}****)"

npm install --silent
npm run build

# ---------------------------------------------------------------------------
step "4/5  번들 검증"

FOUND="$(grep -ohE 'https://[a-z0-9]+\.supabase\.co' dist/assets/*.js 2>/dev/null \
         | sed -E 's#https://([a-z0-9]+)\.supabase\.co#\1#' | sort -u)"

[ -n "$FOUND" ] || fail "번들에서 Supabase 주소를 찾지 못했습니다. 빌드가 올바른지 확인하세요."

for ref in $FOUND; do
  if [ "$ref" != "$EXPECTED_REF" ]; then
    fail "번들에 .env와 다른 Supabase 프로젝트(${ref:0:4}****)가 들어 있습니다. 운영 키가 섞였을 수 있습니다."
  fi
done
echo "  통과: 데모 프로젝트(${EXPECTED_REF:0:4}****) 주소만 포함"

# 실제 secret 키 형태가 번들에 박혔는지 확인한다.
# (라이브러리가 접두사를 비교하는 코드는 값이 따라붙지 않으므로 걸리지 않는다)
if grep -ohE 'sb_secret_[A-Za-z0-9_-]{10,}' dist/assets/*.js 2>/dev/null | grep -q .; then
  fail "번들에 secret 키가 들어 있습니다."
fi
echo "  통과: secret 키 없음"

# ---------------------------------------------------------------------------
step "5/5  변경 요약"

git status --short || true

cat <<'MSG'

검증을 모두 통과했습니다. 이어서 할 일:

  git add -A && git commit -m "운영 저장소 변경분 반영"
  git push   # main에 올라가면 Cloudflare Workers Builds가 알아서 배포한다

README의 스크린샷이 낡지 않았는지도 확인하세요. 화면이 바뀌었다면 docs/img/를 갱신해야
합니다.
MSG
