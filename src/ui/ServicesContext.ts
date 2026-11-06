import { createContext, useContext } from 'react';
import type { Services } from '../app/services';

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices debe usarse dentro de ServicesProvider');
  return services;
}
