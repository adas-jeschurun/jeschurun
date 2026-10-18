#!/usr/bin/env node
/**
 * Mobile (390px) horizontal overflow gate for jes-v2-site.
 * Asserts document.documentElement.scrollWidth <= innerWidth for he+ru routes.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.SITE_BASE || "https://jeschurun.org";
const WIDTH = 390;
const HEIGHT = 844;
const ARTICLE = process.env.ARTICLE_SLUG || "noach-first-work-of-man";

const PATHS = [
  "",
  "articles/",
  `article/${ARTICLE}/`,
  "ask-rav/",
  "search/",
  "about/",
  "archive/",
  "terms/",
  "privacy/",
  "cookies/",
];

async function measure(page, lang, path) {
  const url = `${BASE}/${lang}/${path}`.replace(/([^:]\/)\/+/g, "$1");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForSelector(".site-body, #root", { timeout: 20000 });
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    const el = document.documentElement;
    const body = document.body;
    return {
      scrollWidth: el.scrollWidth,
      innerWidth: window.innerWidth,
      bodyScrollWidth: body ? body.scrollWidth : null,
      overflow: el.scrollWidth > window.innerWidth + 1,
      dir: el.getAttribute("dir") || document.body?.className || "",
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const results = [];

  for (const lang of ["he", "ru"]) {
    for (const path of PATHS) {
      const m = await measure(page, lang, path);
      const route = `/${lang}/${path}`;
      results.push({ route, ...m });
      const mark = m.overflow ? "FAIL" : "ok";
      console.log(
        `${mark} ${route} scrollW=${m.scrollWidth} inner=${m.innerWidth} dir=${m.dir}`,
      );
    }
  }

  await browser.close();
  const failed = results.filter((r) => r.overflow);
  console.log(
    JSON.stringify(
      { ok: failed.length === 0, width: WIDTH, base: BASE, failed, results },
      null,
      2,
    ),
  );
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
