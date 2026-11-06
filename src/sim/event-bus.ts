export type EventHandler<T = unknown> = (payload: T) => void;
export type Unsubscribe = () => void;

export type EventBus = {
  on: <T = unknown>(event: string, handler: EventHandler<T>) => Unsubscribe;
  emit: <T = unknown>(event: string, payload: T) => void;
  off: <T = unknown>(event: string, handler: EventHandler<T>) => void;
};

export function createEventBus(): EventBus {
  const listeners = new Map<string, Set<EventHandler>>();

  const on = <T = unknown>(event: string, handler: EventHandler<T>): Unsubscribe => {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(handler as EventHandler);
    return () => {
      set!.delete(handler as EventHandler);
    };
  };

  const off = <T = unknown>(event: string, handler: EventHandler<T>): void => {
    listeners.get(event)?.delete(handler as EventHandler);
  };

  const emit = <T = unknown>(event: string, payload: T): void => {
    const set = listeners.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      (handler as EventHandler<T>)(payload);
    }
  };

  return { on, emit, off };
}
