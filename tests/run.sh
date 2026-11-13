#!/bin/sh
# 올리기 전 시험
#   sh tests/run.sh check   단순 수정(글귀·색·여백·그림): 코드 검사만
#   sh tests/run.sh full    기능 수정(새 기능·배치·서버·저장): 코드 검사 + 화면 시험
cd "$(dirname "$0")/.." || exit 1
python3 tests/check.py || { echo "코드 검사 실패: 올리지 말고 먼저 고치기"; exit 1; }
[ "$1" = "full" ] || exit 0
python3 tests/smoke.py || { echo "화면 시험 실패: 올리지 말고 먼저 고치기"; exit 1; }
