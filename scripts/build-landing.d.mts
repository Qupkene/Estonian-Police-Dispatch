// Types of scripts/build-landing.mjs for tests/seo.test.ts.
export interface LandingPage {
  slug: string;
  lang: 'et' | 'en';
  title: string;
  description: string;
  alternates?: [string, string][];
}
export const PAGES: LandingPage[];
export function renderAll(): { path: string; html: string }[];
