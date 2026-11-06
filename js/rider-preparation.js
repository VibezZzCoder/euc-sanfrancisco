// NYC Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// One replacement resource, serialized through uncancellable import/painting/GPU work.
// No audio ownership: the host prepares its bank separately and commits both in one synchronous turn.
export function yieldRiderStage() {
  if (typeof requestAnimationFrame !== 'function') return new Promise(resolve => setTimeout(resolve, 0));
  return new Promise(resolve => {
    let finished = false, frame;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(fallback);
      cancelAnimationFrame(frame);
      resolve();
    };
    // Paint the host's stage feedback, then resume in a task. Hidden tabs must not stall forever on rAF.
    const fallback = setTimeout(finish, 80);
    frame = requestAnimationFrame(() => setTimeout(finish, 0));
  });
}

function aborted() {
  return new DOMException('Rider preparation cancelled or superseded', 'AbortError');
}

export class RiderPreparation {
  constructor({ prepare, construct, install, release = () => {}, yieldStage = yieldRiderStage,
    now = () => performance.now() }) {
    Object.assign(this, { prepare, construct, install, release, yieldStage, now });
    this.tail = Promise.resolve();
    this.request = null;
    this.closed = false;
  }

  prepareRider(id, { signal, compile } = {}) {
    if (this.closed || signal?.aborted) return Promise.reject(aborted());
    if (typeof compile !== 'function') return Promise.reject(new TypeError('prepareRider requires the render owner’s compile callback'));
    this.request?.cancel();
    const request = { cancelled: false, resource: null, ready: false, committed: false, controller: new AbortController() };
    const check = () => {
      if (request.cancelled || this.closed || this.request !== request) throw aborted();
    };
    const cleanup = () => {
      signal?.removeEventListener('abort', request.cancel);
      if (this.request === request) this.request = null;
    };
    const disposeResource = () => {
      const resource = request.resource;
      request.resource = null;
      try { resource?.dispose(); } finally { this.release(); }
    };
    request.cancel = () => {
      if (request.committed || request.cancelled) return;
      request.cancelled = true;
      request.controller.abort();
      // Pending compile retains ownership until its promise settles. Never free GPU inputs underneath it.
      if (request.ready) {
        try { disposeResource(); } finally { cleanup(); }
      }
    };
    this.request = request;
    signal?.addEventListener('abort', request.cancel, { once: true });
    const started = this.now();
    const timings = {};
    const run = this.tail.then(async () => {
      try {
        check();
        await this.yieldStage(); check();
        let start = this.now();
        const appearance = await this.prepare(id, { signal: request.controller.signal }); check();
        timings.appearanceMs = this.now() - start;
        await this.yieldStage(); check();
        start = this.now();
        request.resource = this.construct(id, appearance);
        timings.constructionMs = this.now() - start;
        // Texture objects now own their arrays. Drop only generated module-cache ownership.
        this.release(); check();
        await this.yieldStage(); check();
        start = this.now();
        await compile(request.resource, { id, signal: request.controller.signal }); check();
        timings.compileMs = this.now() - start;
        timings.totalMs = this.now() - started;
        request.ready = true;
        return Object.freeze({
          id,
          timings: Object.freeze(timings),
          get valid() { return !request.cancelled && !request.committed; },
          commit: () => {
            if (request.committed || request.cancelled || this.closed || this.request !== request) return false;
            // install owns the transfer only on success; a refused/throwing install keeps this disposable.
            if (this.install(id, request.resource) === false) return false;
            request.committed = true;
            request.resource = null;
            cleanup();
            return true;
          },
          dispose: request.cancel,
        });
      } catch (error) {
        request.cancelled = true;
        try { disposeResource(); } finally { cleanup(); }
        throw error;
      }
    });
    // A failed/cancelled request must not poison the queue; the caller still receives its rejection.
    this.tail = run.then(() => {}, () => {});
    return run;
  }

  cancel() {
    this.request?.cancel();
    return this.tail;
  }

  dispose() {
    this.closed = true;
    return this.cancel();
  }
}
