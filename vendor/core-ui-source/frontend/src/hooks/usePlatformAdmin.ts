import { useAuth } from '../context/AuthContext';
import type { User } from '../types';

export function isPlatformAdmin(user: User | null | undefined): boolean {
  return user?.roles?.includes('admin') ?? false;
}

export function usePlatformAdmin(): boolean {
  const { user } = useAuth();
  return isPlatformAdmin(user);
}
