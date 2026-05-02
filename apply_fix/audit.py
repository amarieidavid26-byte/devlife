import hashlib
import persistence.db as db


def make_patch_hash(original_text: str, replacement_text: str) -> str:
    combined = f"{original_text}|||{replacement_text}"
    return hashlib.sha256(combined.encode()).hexdigest()[:16]


def record(action: str, patch_hash: str, file: str = None,
           original_text: str = None, reason: str = None):
    db.save_apply_fix_audit(
        action=action,
        file=file,
        range_before=original_text[:200] if original_text else None,
        patch_hash=patch_hash,
        reason=reason,
    )
