// Lazy-loading workspace file tree. Clicking a file calls onOpenFile(relPath).
import { listDir } from '../../network/files.js';

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
        header.textContent = 'WORKSPACE';
        header.style.cssText = 'color:#7a7a7a;font-size:10px;letter-spacing:1px;padding:4px 12px 8px;';
        this.el.appendChild(header);
        const body = document.createElement('div');
        this._body = body;
        this.el.appendChild(body);
        await this._renderInto(body, '', 0);
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
