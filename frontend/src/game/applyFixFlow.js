// apply-fix flow: backend validation -> diff preview -> confirm -> apply, with a
// Revert button on the toast wired to the rollback endpoint

import { i18n } from '../i18n/index.js';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function createApplyFixHandler({ apps, socket, toastSystem }) {
    return async (code, rationale) => {
        const editor = apps.desk_computer;
        if (!editor || !editor.isOpen || !code) return;

        const originalText = editor.editor ? editor.editor.getValue() : '';
        const lang = editor.currentLang || 'python';

        // backend validation first
        const patchBody = {
            file: `demo.${lang === 'javascript' ? 'js' : lang}`,
            language: lang,
            range: { start_line: 1, end_line: (originalText.split('\n').length) },
            replacement_text: code,
            rationale: rationale || 'ghost suggestion',
            severity: 'medium',
            original_text: originalText,
        };

        let patchHash = null;
        try {
            const res = await fetch(`${API}/api/apply-fix/preview`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patchBody),
            });
            const json = await res.json();
            if (!res.ok || !json.valid) {
                toastSystem.show('warning', i18n.t('toast.fix_rejected'), json.reason || i18n.t('apply_fix.validation_failed'), 4000);
                return;
            }
            patchHash = json.patch_hash;
        } catch (e) {
            toastSystem.show('warning', i18n.t('toast.fix_rejected'), i18n.t('toast.whoop_unavailable'), 3000);
            return;
        }

        // show preview — user must confirm
        const confirmed = await editor.showPatchPreview(originalText, code, rationale);
        if (!confirmed) {
            toastSystem.show('info', i18n.t('toast.fix_cancelled'), i18n.t('toast.fix_cancelled_body'), 2000);
            return;
        }

        // confirm with backend and apply
        await fetch(`${API}/api/apply-fix/confirm`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patch_hash: patchHash }),
        });

        editor.replaceContent(code);
        socket.sendFeedback('Apply Fix');

        toastSystem.show('ghost', i18n.t('toast.fix_applied'), i18n.t('toast.fix_applied_body'), 8000, {
            label: i18n.t('toast.revert'),
            onClick: async () => {
                try {
                    const res = await fetch(`${API}/api/apply-fix/rollback`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ patch_hash: patchHash }),
                    });
                    const json = await res.json();
                    if (res.ok && json.original_text != null) {
                        editor.replaceContent(json.original_text);
                        toastSystem.show('info', i18n.t('toast.fix_reverted'), '', 3000);
                    }
                } catch (e) {
                    editor.replaceContent(originalText);
                    toastSystem.show('info', i18n.t('toast.fix_reverted'), '', 3000);
                }
            },
        });
    };
}
