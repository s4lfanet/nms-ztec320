/**
 * Vitest setup — runs before each test file.
 * Configures jest-dom matchers for DOM assertions.
 */
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom lacks matchMedia — stub it for theme/prefers-color-scheme consumers.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
