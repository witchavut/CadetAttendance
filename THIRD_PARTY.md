# Third-party components

Local browser libraries are pinned and included so the application does not depend on a CDN at runtime.

| Component | Version | License | Source |
| --- | --- | --- | --- |
| supabase-js browser UMD | 2.57.4 | MIT | https://github.com/supabase/supabase-js |
| SheetJS Community Edition | 0.20.3 | Apache-2.0 | https://docs.sheetjs.com/docs/getting-started/installation/standalone/ |
| IBM Plex Sans Thai | Google Fonts v11 distribution | SIL Open Font License 1.1 | https://github.com/IBM/plex |

Supabase browser distribution: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.js

SheetJS browser distribution: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js

The Edge Function imports the same supabase-js version from the official npm package. The database integration tests use the external PGlite development dependency; it is not shipped as a runtime dependency.
