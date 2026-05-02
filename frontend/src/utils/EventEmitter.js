export class EventEmitter {
    constructor() {
        this._events = {};
    }
    on(event, cb) {
        if (!this._events[event]) this._events[event] = [];
        this._events[event].push(cb);
        return this;
    }
    off(event, cb) {
        if (!this._events[event]) return;
        this._events[event] = this._events[event].filter(fn => fn !== cb);
    }
    emit(event, ...args) {
        (this._events[event] || []).forEach(cb => cb(...args));
    }
}
