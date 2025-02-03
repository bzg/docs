import React from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventCallback<T = any> = (data: T) => void;

interface EventSubscription {
  eventName: string;
  callback: EventCallback;
}

class EventEmitter {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  // S'abonner à un événement
  subscribe<T>(
    eventName: string,
    callback: EventCallback<T>,
  ): EventSubscription {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    const callbacks = this.listeners.get(eventName);
    if (!callbacks) {
      throw new Error(`Event ${eventName} not found`);
    }
    callbacks.add(callback);

    return {
      eventName,
      callback,
    };
  }

  // Se désabonner d'un événement
  unsubscribe({ eventName, callback }: EventSubscription): void {
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(eventName);
      }
    }
  }

  // Émettre un événement
  emit<T>(eventName: string, data?: T): void {
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(
            `Erreur lors de l'exécution du callback pour l'événement ${eventName}:`,
            error,
          );
        }
      });
    }
  }
}

// Créer une instance unique pour toute l'application
export const eventEmitter = new EventEmitter();

// Hook personnalisé pour utiliser les événements dans les composants React
export function useEvent<T>(eventName: string, callback: EventCallback<T>) {
  React.useEffect(() => {
    const subscription = eventEmitter.subscribe(eventName, callback);
    return () => {
      eventEmitter.unsubscribe(subscription);
    };
  }, [eventName, callback]);
}
