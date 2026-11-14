import { defineConfig } from 'vitest/config';

// Unit tests cover the pure logic of each tool (parsers, generators, formatting).
// They run in Node: none of the tested modules touch the DOM.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // @sapphirelabs/ui ships TypeScript sources: let Vitest compile them.
    server: { deps: { inline: ['@sapphirelabs/ui'] } },
  },
});
