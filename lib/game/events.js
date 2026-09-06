/**
 * Node 와 브라우저에서 같이 쓰는 최소 EventEmitter.
 * 엔진이 node:events 에 의존하지 않게 해서 사이트 데모(브라우저)에서도 그대로 실행되게 한다.
 */
export class EventEmitter {
  constructor() {
    this._listeners = new Map();
    this._max = 10;
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return this;
  }

  once(event, fn) {
    const wrap = (...args) => {
      this.off(event, wrap);
      fn(...args);
    };
    return this.on(event, wrap);
  }

  off(event, fn) {
    const list = this._listeners.get(event);
    if (!list) return this;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) this._listeners.delete(event);
    return this;
  }

  emit(event, ...args) {
    const list = this._listeners.get(event);
    if (!list || !list.length) return false;
    for (const fn of [...list]) fn(...args);
    return true;
  }

  removeAllListeners(event) {
    if (event === undefined) this._listeners.clear();
    else this._listeners.delete(event);
    return this;
  }

  listenerCount(event) {
    return this._listeners.get(event)?.length ?? 0;
  }

  setMaxListeners(n) {
    this._max = n;
    return this;
  }
}
