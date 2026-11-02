import type { ReactNode } from 'react';
import type { Services } from '../app/services';
import { ServicesContext } from './ServicesContext';

export function ServicesProvider({
  services,
  children,
}: {
  services: Services;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}
