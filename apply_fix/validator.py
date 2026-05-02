import re
from apply_fix.contract import PatchContract

# shell injection patterns — flag these outside obvious string literals
_SHELL_PATTERNS = re.compile(
    r'(?:^|[^"\'])(?:'
    r';\s*(?:rm|wget|curl|chmod|chown|sudo|bash|sh|python|node|exec)\b'
    r'|`[^`]+`'
    r'|\$\([^)]+\)'
    r'|\bos\.system\s*\('
    r'|\bsubprocess\.'
    r')',
    re.MULTILINE,
)

MAX_LINES = 50


def validate_patch(contract: PatchContract) -> tuple:
    if not contract.rationale.strip():
        return False, "rationale is empty"

    if contract.range.end_line < contract.range.start_line:
        return False, "end_line must be >= start_line"

    range_size = contract.range.end_line - contract.range.start_line + 1
    if range_size > MAX_LINES:
        return False, f"range too large: {range_size} lines (max {MAX_LINES})"

    replacement_lines = contract.replacement_text.count("\n") + 1
    if replacement_lines > MAX_LINES:
        return False, f"replacement too large: {replacement_lines} lines (max {MAX_LINES})"

    if _SHELL_PATTERNS.search(contract.replacement_text):
        return False, "patch contains potentially unsafe shell patterns"

    return True, "ok"
