import type { TutorApi } from '../../shared/types';

declare global {
  interface Window {
    tutor: TutorApi;
  }
}

export {};
