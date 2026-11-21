import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ListDemoAccountsResponse, User } from '@tunion/shared';
import { api, getStoredDemoUserId, storeDemoUserId } from './api';

// DEMO AUTHENTICATION - NOT SECURE. Selection is stored in localStorage and
// sent as a plain header. There are no passwords or sessions.
interface DemoAuthState {
  accounts: User[];
  current: User | null;
  loading: boolean;
  error: string | null;
  switchTo: (id: number | null) => void;
}

const Ctx = createContext<DemoAuthState | null>(null);

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<User[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(getStoredDemoUserId());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ListDemoAccountsResponse>('/demo-auth/accounts')
      .then((r) => setAccounts(r.accounts))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const switchTo = (id: number | null) => {
    storeDemoUserId(id);
    setCurrentId(id);
  };

  const current = accounts.find((a) => a.id === currentId) ?? null;
  return <Ctx.Provider value={{ accounts, current, loading, error, switchTo }}>{children}</Ctx.Provider>;
}

export function useDemoAuth(): DemoAuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDemoAuth must be used within DemoAuthProvider');
  return v;
}
