import { createContext, useContext } from 'react';

export const ExperienceModeContext = createContext<
  'simple' | 'advanced' | null
>(null);
export const useExperienceMode = () => useContext(ExperienceModeContext);
