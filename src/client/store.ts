// Minimal shared UI store — auth lives in auth-context.tsx.
// This file holds ephemeral cross-component UI state (selected account, filters).

import { useSyncExternalStore } from 'react';

export interface UiState {
  selectedBrokerAccountId: string | null;
  selectedBotId: string | null;
  positionsFilter: {
    brokerAccountId?: string;
    botId?: string;
    direction?: 'buy' | 'sell';
    onlyProfitable?: boolean;
  };
}

let state: UiState = {
  selectedBrokerAccountId: null,
  selectedBotId: null,
  positionsFilter: {},
};

const listeners = new Set<() => void>();
function emit() { for (const l of listeners) l(); }

export const uiStore = {
  get(): UiState { return state; },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  set(patch: Partial<UiState>): void {
    state = { ...state, ...patch };
    emit();
  },
  setPositionsFilter(patch: Partial<UiState['positionsFilter']>): void {
    state = { ...state, positionsFilter: { ...state.positionsFilter, ...patch } };
    emit();
  },
};

export function useUiStore<T>(selector: (s: UiState) => T): T {
  return useSyncExternalStore(
    uiStore.subscribe,
    () => selector(uiStore.get()),
    () => selector(uiStore.get()),
  );
}