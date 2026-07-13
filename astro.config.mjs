import { defineConfig } from 'astro/config';

// Static output (default in Astro 5). All interactivity lives in
// client-side <script> islands, so no adapter is needed.
export default defineConfig({
  output: 'static',
  build: {
    // /stats -> dist/stats/index.html, keeps clean URLs for the SW precache
    format: 'directory',
  },
});
