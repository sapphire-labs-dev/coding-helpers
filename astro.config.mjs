import { defineConfig } from 'astro/config';
import { siteConfig } from '@sapphirelabs/ui/config';

// Shared Sapphire Labs site setup: strict Content-Security-Policy, no
// third-party requests. HTTP-only headers (frame-ancestors etc.) are in vercel.json.
// The domain is provisional until it is decided.
export default defineConfig(siteConfig({ site: 'https://dev.sapphire-labs.dev' }));
