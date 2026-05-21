// Lazy-loading workspace file tree. Clicking a file calls onOpenFile(relPath).
// Right-click a row (or use the header buttons) to create/rename/delete files & folders.
import { listDir, createPath, renamePath, deletePath } from '../../network/files.js';
import { i18n } from '../../i18n/index.js';

export class FileTree {
    constructor(onOpenFile) {
        this.onOpenFile = onOpenFile;
        this.el = document.createElement('div');
        this.el.style.cssText = `
            width:220px;flex-shrink:0;background:#181818;border-right:1px solid #2a2a2a;
            overflow:auto;padding:6px 0;font-family:'Nunito',system-ui,sans-serif;`;
        this._activeRow = null;
    }

    async mount() {
        this.el.innerHTML = '';
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 8px 8px 12px;';
        const label = document.createElement('span');
        label.textContent = i18n.t('filetree.workspace');
        label.style.cssText = 'color:#7a7a7a;font-size:10px;letter-spacing:1px;';
        header.appendChild(label);

        const tools = document.createElement('div');
        tools.style.cssText = 'display:flex;gap:6px;';
        const mkBtn = (txt, title, fn) => {
            const b = document.createElement('button');
            b.textContent = txt;
            b.title = title;
            b.style.cssText = 'background:transparent;border:none;color:#9a9a9a;cursor:pointer;font-size:13px;padding:0 2px;';
            b.addEventListener('mouseenter', () => { b.style.color = '#fff'; });
            b.addEventListener('mouseleave', () => { b.style.color = '#9a9a9a'; });
            b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
            return b;
        };
        tools.appendChild(mkBtn('🗋', i18n.t('filetree.new_file'), () => this._createAt('', 'file')));
        tools.appendChild(mkBtn('🗀', i18n.t('filetree.new_folder'), () => this._createAt('', 'dir')));
        tools.appendChild(mkBtn('⟳', i18n.t('filetree.refresh'), () => this.refresh()));
        header.appendChild(tools);
        this.el.appendChild(header);

        const body = document.createElement('div');
        this._body = body;
        this.el.appendChild(body);
        await this._renderInto(body, '', 0);
    }

    async _createAt(parentRel, kind) {
        const name = (window.prompt(kind === 'dir' ? i18n.t('filetree.prompt_folder_name') : i18n.t('filetree.prompt_file_name')) || '').trim();
        if (!name) return;
        const rel = parentRel ? `${parentRel}/${name}` : name;
        try { await createPath(rel, kind); this.refresh(); if (kind === 'file') this.onOpenFile(rel); }
        catch (e) { window.alert(i18n.t('filetree.create_failed', { msg: e.message })); }
    }

    async _rename(entry) {
        const next = (window.prompt(i18n.t('filetree.prompt_rename'), entry.name) || '').trim();
        if (!next || next === entry.name) return;
        const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
        const dst = parent ? `${parent}/${next}` : next;
        try { await renamePath(entry.path, dst); this.refresh(); }
        catch (e) { window.alert(i18n.t('filetree.rename_failed', { msg: e.message })); }
    }

    async _delete(entry) {
        const kind = entry.type === 'dir' ? i18n.t('filetree.kind_folder') : i18n.t('filetree.kind_file');
        if (!window.confirm(i18n.t('filetree.confirm_delete', { kind, name: entry.name }))) return;
        try { await deletePath(entry.path); this.refresh(); }
        catch (e) { window.alert(i18n.t('filetree.delete_failed', { msg: e.message })); }
    }

    _contextMenu(ev, entry) {
        ev.preventDefault();
        ev.stopPropagation();
        document.querySelectorAll('.ft-ctx').forEach(m => m.remove());
        const menu = document.createElement('div');
        menu.className = 'ft-ctx';
        menu.style.cssText = `position:fixed;left:${ev.clientX}px;top:${ev.clientY}px;z-index:2000;background:#222;border:1px solid #3a3a3a;border-radius:4px;padding:4px 0;min-width:140px;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,0.4);`;
        const item = (txt, fn) => {
            const i = document.createElement('div');
            i.textContent = txt;
            i.style.cssText = 'padding:5px 14px;color:#cfcfcf;cursor:pointer;';
            i.addEventListener('mouseenter', () => { i.style.background = 'rgba(255,255,255,0.08)'; });
            i.addEventListener('mouseleave', () => { i.style.background = 'transparent'; });
            i.addEventListener('click', () => { menu.remove(); fn(); });
            menu.appendChild(i);
        };
        if (entry.type === 'dir') {
            item(i18n.t('filetree.new_file'), () => this._createAt(entry.path, 'file'));
            item(i18n.t('filetree.new_folder'), () => this._createAt(entry.path, 'dir'));
        }
        item(i18n.t('filetree.rename'), () => this._rename(entry));
        item(i18n.t('filetree.delete'), () => this._delete(entry));
        document.body.appendChild(menu);
        const close = () => { menu.remove(); document.removeEventListener('click', close); };
        setTimeout(() => document.addEventListener('click', close), 0);
    }

    refresh() {
        const scroll = this.el.scrollTop;
        this.mount().then(() => { this.el.scrollTop = scroll; });
    }

    async _renderInto(container, path, depth) {
        let data;
        try { data = await listDir(path); } catch (_) { return; }
        for (const entry of data.entries) {
            const row = document.createElement('div');
            row.style.cssText = `padding:3px 8px 3px ${10 + depth * 12}px;color:#cfcfcf;font-size:13px;
                cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:3px;`;
            const icon = entry.type === 'dir' ? '▸ 📁' : '📄';
            row.textContent = `${icon} ${entry.name}`;
            row.addEventListener('mouseenter', () => { if (row !== this._activeRow) row.style.background = 'rgba(255,255,255,0.06)'; });
            row.addEventListener('mouseleave', () => { if (row !== this._activeRow) row.style.background = 'transparent'; });
            row.addEventListener('contextmenu', (e) => this._contextMenu(e, entry));

            if (entry.type === 'dir') {
                const childWrap = document.createElement('div');
                childWrap.style.display = 'none';
                let loaded = false;
                row.addEventListener('click', async () => {
                    const opening = childWrap.style.display === 'none';
                    childWrap.style.display = opening ? 'block' : 'none';
                    row.textContent = `${opening ? '▾ 📂' : '▸ 📁'} ${entry.name}`;
                    if (opening && !loaded) { loaded = true; await this._renderInto(childWrap, entry.path, depth + 1); }
                });
                container.appendChild(row);
                container.appendChild(childWrap);
            } else {
                row.addEventListener('click', () => {
                    if (this._activeRow) this._activeRow.style.background = 'transparent';
                    this._activeRow = row;
                    row.style.background = 'rgba(0,122,204,0.25)';
                    this.onOpenFile(entry.path);
                });
                container.appendChild(row);
            }
        }
    }
}
