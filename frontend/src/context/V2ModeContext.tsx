import { createContext, useContext, ReactNode } from 'react';

const V2ModeContext = createContext(false);

export function V2ModeProvider({ children }: { children: ReactNode }) {
  return <V2ModeContext.Provider value={true}>{children}</V2ModeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useV2Mode() {
  return useContext(V2ModeContext);
}
