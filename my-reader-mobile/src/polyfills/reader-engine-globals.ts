/**
 * foliate-js / pdfjs-dist assume browser globals during module evaluation.
 * Hermes does not provide these; install minimal stubs before any import of my-reader-tools.
 */

type PromiseWithResolversResult<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

type PromiseConstructorWithResolvers = PromiseConstructor & {
  withResolvers?<T>(): PromiseWithResolversResult<T>;
};

function installPromiseWithResolvers(): void {
  const PromiseCtor = Promise as PromiseConstructorWithResolvers;
  if (typeof PromiseCtor.withResolvers === "function") return;

  PromiseCtor.withResolvers = function withResolvers<T>(): PromiseWithResolversResult<T> {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

function installNavigator(): void {
  const currentNavigator = globalThis.navigator as
    | {
        userAgent?: string;
        platform?: string;
        product?: string;
      }
    | undefined;

  if (
    currentNavigator &&
    typeof currentNavigator.userAgent === "string" &&
    typeof currentNavigator.platform === "string"
  ) {
    return;
  }

  const navigatorPolyfill = {
    ...(currentNavigator ?? {}),
    userAgent: currentNavigator?.userAgent ?? "ReactNative Hermes",
    platform: currentNavigator?.platform ?? "Linux arm64",
    product: currentNavigator?.product ?? "ReactNative",
  };

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: navigatorPolyfill,
  });
}

function installEventTarget(): void {
  if (typeof globalThis.EventTarget !== "undefined") return;

  type Listener = EventListener | EventListenerObject;

  class EventTargetPolyfill {
    private readonly listeners = new Map<string, Set<Listener>>();

    addEventListener(type: string, callback: Listener | null, _options?: unknown): void {
      if (callback == null) return;
      let set = this.listeners.get(type);
      if (!set) {
        set = new Set();
        this.listeners.set(type, set);
      }
      set.add(callback);
    }

    removeEventListener(type: string, callback: Listener | null, _options?: unknown): void {
      if (callback == null) return;
      this.listeners.get(type)?.delete(callback);
    }

    dispatchEvent(event: Event): boolean {
      const set = this.listeners.get(event.type);
      if (!set) return true;
      for (const cb of set) {
        if (typeof cb === "function") {
          cb.call(this as unknown as EventTarget, event);
        } else {
          cb.handleEvent?.(event);
        }
      }
      return true;
    }
  }

  globalThis.EventTarget = EventTargetPolyfill as unknown as typeof EventTarget;
}

function installDOMMatrix(): void {
  if (typeof globalThis.DOMMatrix !== "undefined") return;

  class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m13 = 0;
    m14 = 0;
    m21 = 0;
    m22 = 1;
    m23 = 0;
    m24 = 0;
    m31 = 0;
    m32 = 0;
    m33 = 1;
    m34 = 0;
    m41 = 0;
    m42 = 0;
    m43 = 0;
    m44 = 1;
    is2D = true;
    isIdentity = true;

    multiplySelf(_other?: DOMMatrixPolyfill): DOMMatrixPolyfill {
      return this;
    }

    preMultiplySelf(_other?: DOMMatrixPolyfill): DOMMatrixPolyfill {
      return this;
    }

    translateSelf(tx = 0, ty = 0, _tz = 0): DOMMatrixPolyfill {
      this.e += tx;
      this.f += ty;
      return this;
    }

    scaleSelf(
      _scaleX = 1,
      _scaleY?: number,
      _scaleZ?: number,
      _originX?: number,
      _originY?: number,
      _originZ?: number,
    ): DOMMatrixPolyfill {
      return this;
    }

    rotateSelf(_rotX?: number, _rotY?: number, _rotZ?: number): DOMMatrixPolyfill {
      return this;
    }

    invertSelf(): DOMMatrixPolyfill {
      return this;
    }

    setMatrixValue(_transformList: string): void {}
  }

  globalThis.DOMMatrix = DOMMatrixPolyfill as unknown as typeof DOMMatrix;
  if (typeof globalThis.DOMMatrixReadOnly === "undefined") {
    globalThis.DOMMatrixReadOnly = DOMMatrixPolyfill as unknown as typeof DOMMatrixReadOnly;
  }
}

installPromiseWithResolvers();
installNavigator();
installEventTarget();
installDOMMatrix();
