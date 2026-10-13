import { useSyncExternalStore } from 'react';

import { getState, me, subscribe, type State } from '@/core/store';
import type { User } from '@/core/types';

export function useApp(): State {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useMe(): User {
  return me(useApp());
}
