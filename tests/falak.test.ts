import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFalakPage, networkUnavailable } from "../server/falak";
import { builtInFeeds } from "../server/sources";
import { mergeArticles } from "../server/rss";
const feed = builtInFeeds.find((f) => f.id === "falak-reports")!;
const card = (url: string, title = "Qatar startup") =>
  `<div class="product-card"><div class="product-card__title"><a href="${url}">${title}</a></div><div class="product-details"><h6>Founder &amp; SME innovation</h6><script>bad()</script></div></div>`;
test("Falak listings exclude navigation and unsafe links, sanitize text and deduplicate", () => {
  const html = `<nav>${card("/products/navigation")}</nav><main>${card("/products/startup")}${card("/products/startup")}${card("https://example.com/products/outside")}${card("javascript:alert(1)")}${card("/pages/login")}${card("/products/noise", "YouTube")}</main>`;
  const items = parseFalakPage(html, feed, "2026-11-12T00:00:00Z");
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://www.falak.qa/products/startup");
  assert.equal(items[0].description, "Founder & SME innovation");
  assert.equal(items[0].publishedAt, null);
  assert.deepEqual(items[0].categories, [feed.category]);
  assert.equal(mergeArticles(items, parseFalakPage(html, feed)).added, 0);
});
test("Falak reports support title anchors and report descriptions", () => {
  const reports = builtInFeeds.find((f) => f.id === "falak-reports")!;
  const items = parseFalakPage(
    '<main><div class="product-card"><a class="product-card__title" href="/products/report">Startup report</a><div class="product-description">Research findings</div></div></main>',
    reports,
  );
  assert.equal(items[0].title, "Startup report");
  assert.equal(items[0].description, "Research findings");
  assert.deepEqual(items[0].categories, ["falaq/Whitepapers & Reports"]);
});
test("Falak network does not import unrelated Knowledge Hub articles or fabricate listings", () => {
  const network = builtInFeeds.find((f) => f.id === "falak-network")!;
  assert.throws(
    () =>
      parseFalakPage(
        '<main><h2>The Knowledge Hub By Falak</h2><a href="/blogs/knowledge-hub/article">Article</a></main>',
        network,
      ),
    { message: networkUnavailable },
  );
  assert.throws(() => parseFalakPage("<html>Access denied</html>", feed));
});
