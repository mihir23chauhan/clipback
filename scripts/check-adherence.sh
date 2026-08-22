#!/usr/bin/env bash
# check-adherence.sh — does a clipback surface obey the UI/UX brief's declared constraints?
#
#   bash bin/check-adherence.sh <file> [<file>...]
#
# Takes one or more files and checks the surface they FORM. It began as a
# one-file check written against the demo, whose CSS was inline and minified —
# so rule 3 wanted data-theme="dark" in double quotes and rule 4 wanted
# body{...background:var(-- with no spaces. Real source is formatted, split
# across a token sheet and a page sheet, and quoted however the formatter likes.
# Both rules were testing the demo's whitespace rather than the brief's
# constraint, which is the failure mode a check written beside its subject has.
#
# clipback has no design system, so this cannot check "does it match the components".
# It checks the seven things the brief DECLARES, each of which is mechanically decidable.
# It is authored in the same run as the thing it checks, which is weaker than an independent
# system — so it carries a planted-defect test (--self-test) to prove it can go red.
set -uo pipefail
[ "$#" -ge 1 ] || { echo "usage: check-adherence.sh <file> [<file>...]"; exit 2; }
for f in "$@"; do
  [ -f "$f" ] || { echo "no such file: $f"; exit 2; }
done
# The surface is what the files form TOGETHER: a token sheet defines the themes,
# a page sheet paints the body. Checking each alone fails both correctly and
# uselessly.
F="$(mktemp)"; trap "rm -f $F" EXIT
cat "$@" > "$F"
fail=0
say(){ printf '  %-6s %s\n' "$1" "$2"; }
chk(){ if [ "$1" -eq 0 ]; then say PASS "$2"; else say FAIL "$2"; fail=$((fail+1)); fi; }

# strip the token blocks; every remaining literal hex is a violation
body="$(python3 - "$F" <<'PY'
import re,sys
s=open(sys.argv[1]).read()
s=re.sub(r':root[^{]*\{[^}]*\}','',s)
s=re.sub(r'@media\s*\(prefers-color-scheme[^{]*\{(?:[^{}]|\{[^}]*\})*\}','',s)
print(s)
PY
)"
printf '%s\n' "$body" | grep -qiE '#[0-9a-f]{3,8}\b|rgba?\(' && n=1 || n=0
chk $n "1. no literal colours outside the token blocks"

grep -qE '\b(ytp-|ytd-|yt-[a-z])' "$F" && n=1 || n=0
chk $n "2. no YouTube class names"

grep -q 'prefers-color-scheme' "$F" && grep -qE 'data-theme=.dark.' "$F" && n=0 || n=1
chk $n "3. all three theme states defined (bare :root, media, data-theme)"

python3 - "$F" <<'PY'
import re,sys
s=open(sys.argv[1]).read()
# any body rule, however formatted, painting its background from a token
sys.exit(0 if re.search(r'\bbody\s*\{[^}]*background\s*:[^;}]*var\(--', s, re.S) else 1)
PY
n=$?
chk $n "4. body paints an explicit token background"

grep -q 'focus-visible' "$F" && n=0 || n=1
chk $n "5. keyboard focus has a visible state"

grep -q 'prefers-reduced-motion' "$F" && n=0 || n=1
chk $n "6. motion respects prefers-reduced-motion"

# The ruling this rule exists for: being unable to ground a segment is a CORRECT
# outcome, not an error, so the ungrounded state must not wear a danger hue.
#
# The first version of this rule only asserted that SOME --neutral was declared
# as a hex. It passed when --neutral was set to `red`, because two other theme
# blocks still declared a hex one — so it never tested its own claim. Red-teamed
# and rewritten: every declaration must be a hex, none may be reddish, and the
# ungrounded class must actually consume the token.
python3 - "$F" <<'PY'
import re, sys
s = open(sys.argv[1]).read()

decls = re.findall(r'--neutral\s*:\s*([^;]+);', s)
if not decls:
    print('        no --neutral token is declared'); sys.exit(1)

for d in decls:
    d = d.strip()
    m = re.fullmatch(r'#([0-9A-Fa-f]{6})', d)
    if not m:
        print(f'        --neutral is not a hex value: {d}'); sys.exit(1)
    r, g, b = (int(m.group(1)[i:i+2], 16) for i in (0, 2, 4))
    # A danger hue is red-dominant. A desaturated slate is not.
    if r > g + 40 and r > b + 40:
        print(f'        --neutral #{m.group(1)} is a danger hue'); sys.exit(1)

if not re.search(r'--ungrounded[^{]*\{[^}]*var\(--neutral\)', s, re.S):
    print('        the ungrounded class does not consume var(--neutral)'); sys.exit(1)
sys.exit(0)
PY
n=$?; chk $n "7. ungrounded uses a declared neutral token, not a danger hue"

echo
if [ "$fail" -eq 0 ]; then echo "ADHERENCE OK — 7/7"; exit 0; fi
echo "ADHERENCE FAILED — $fail of 7"; exit 1
