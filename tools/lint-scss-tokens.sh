#!/usr/bin/env bash
# Design-token lint gate for apps/web SCSS (docs/DESIGN-SYSTEM.md, "Lint gate").
#
# Fails when:
#   - a raw hex literal appears in any *.scss outside shared/tokens.scss;
#   - a raw numeric `rem` value appears outside shared/typography.scss.
#
# Structural values are legal everywhere and are not matched: `0`, `100%`,
# `1fr`, `1px` hairlines and documented breakpoint widths are layout, not
# design decisions.
#
# Usage: lint-scss-tokens.sh [file.scss ...]
# With no arguments every tracked SCSS file under apps/web/src is checked.
set -uo pipefail

HEX='#[0-9a-fA-F]{3,8}\b'
REM='(^|[^-a-zA-Z0-9_])[0-9]*\.?[0-9]+rem\b'

# Ratchet: these files still carry pre-redesign raw values. Each entry is
# deleted as its component wave migrates to tokens (openspec change
# add-l-brand-neo-shepherd-redesign, sections 7-12). Nothing may be added.
LEGACY=(
  apps/web/src/app/board/board.scss
  apps/web/src/app/board/column.scss
  apps/web/src/app/board/empty-state.scss
  apps/web/src/app/board/filter-bar.scss
)

is_legacy() {
  local candidate="${1#./}"
  for legacy in "${LEGACY[@]}"; do
    [ "$candidate" = "$legacy" ] && return 0
  done
  return 1
}

files=("$@")
if [ "${#files[@]}" -eq 0 ]; then
  while IFS= read -r found; do
    files+=("$found")
  done < <(find apps/web/src -name '*.scss' | sort)
fi

rc=0
for file in "${files[@]}"; do
  [ -f "$file" ] || continue
  is_legacy "$file" && continue

  case "$file" in
  *shared/tokens.scss) pattern="$REM" ;;
  *shared/typography.scss) pattern="$HEX" ;;
  *) pattern="$HEX|$REM" ;;
  esac

  if grep -nHE "$pattern" "$file"; then
    rc=1
  fi
done

if [ "$rc" -ne 0 ]; then
  cat >&2 <<'MSG'

design-token lint failed: raw values above are not allowed.
  colours  -> add/consume a token in apps/web/src/app/shared/tokens.scss
  rem      -> use var(--fs-*) / var(--lh-*) from shared/typography.scss
  spacing  -> use var(--sp-*); structural 0 / 100% / 1fr / 1px are fine
See docs/DESIGN-SYSTEM.md.
MSG
fi

exit "$rc"
