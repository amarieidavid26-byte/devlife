import ro from './ro.json';
import en from './en.json';

const LANGS = { ro, en };
const LS_KEY = 'devlife_lang';

let _lang = localStorage.getItem(LS_KEY) || 'ro';
const _listeners = new Set();

export const i18n = {
    t(key, vars = {}) {
        let str = LANGS[_lang]?.[key] ?? LANGS['ro']?.[key] ?? key;
        for (const [k, v] of Object.entries(vars)) {
            str = str.replace(`{${k}}`, v);
        }
        return str;
    },

    setLang(lang) {
        if (!LANGS[lang]) return;
        _lang = lang;
        localStorage.setItem(LS_KEY, lang);
        _listeners.forEach(fn => fn(lang));
    },

    getLang() { return _lang; },

    onChange(fn) { _listeners.add(fn); },
    offChange(fn) { _listeners.delete(fn); },
};
