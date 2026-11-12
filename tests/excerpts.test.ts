import { test } from "node:test";
import assert from "node:assert/strict";
import { firstParagraph, parse, mergeArticles } from "../server/rss";
import { builtInFeeds } from "../server/sources";

const feed = builtInFeeds.find((f) => f.id === "falak-news")!;
const title = "Invest Qatar, Aurion Capital and LG NOVA Partner to Advance Technology Investment and Venture-Building in Qatar";
const opening = "Doha, Qatar — September 23, 2026. Invest Qatar, Qatar's investment promotion agency, has signed a new partnership with global investment group Aurion Capital and LG NOVA, LG Electronics' Silicon Valley-based innovation arm, to expand technology investment and venture-building activity in Qatar and across the wider Gulf region. The agreement was announced in New York during a special Qatar Economic Forum session held on the sidelines of the 2026 United Nations General Assembly.";

test("Atom keeps the original title and complete first content paragraph rather than the summary or full body", async () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Falak</title><entry><id>example</id><title>${title}</title><link href="https://www.falak.qa/blogs/news-12/example"/><summary type="html">Short teaser</summary><content type="html"><![CDATA[<p><strong>Doha, Qatar — September 23, 2026.</strong>${opening.slice(opening.indexOf(" Invest Qatar"))}</p><h2>Details</h2><p>Second paragraph excluded.</p>]]></content></entry></feed>`;
  const [article] = await parse(xml, feed);
  assert.equal(article.title, title);
  assert.equal(article.description, opening);
  const prior = { ...article, title: "Old title", description: "Previously stored full body", sourceIds: ["other"] };
  const result = mergeArticles([prior], [article]);
  assert.equal(result.added, 0);
  assert.equal(result.articles[0].description, opening);
  assert.deepEqual(result.articles[0].sourceIds, ["other", "falak-news"]);
});

test("excerpt extraction handles empty paragraphs, unsafe markup, plain text and unavailable content", () => {
  assert.equal(firstParagraph('<script>bad()</script><p> </p><p>Hello <b>Qatar</b> &amp; founders.</p><p>Later</p>'), "Hello Qatar & founders.");
  assert.equal(firstParagraph("First line\ncontinues here.\n\nSecond paragraph."), "First line continues here.");
  assert.equal(firstParagraph("First paragraph.<br><br>Second paragraph."), "First paragraph.");
  assert.equal(firstParagraph(""), "");
});

test("RSS prefers encoded article content and falls back to a summary or title alone", async () => {
  const xml = `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>News</title><item><title>Full article</title><link>https://example.com/full</link><description>Teaser</description><content:encoded><![CDATA[<p>Actual opening.</p><p>Later.</p>]]></content:encoded></item><item><title>Summary only</title><link>https://example.com/summary</link><description><![CDATA[<p>Available excerpt.</p><p>More</p>]]></description></item><item><title>Title only</title><link>https://example.com/title</link></item></channel></rss>`;
  const articles = await parse(xml, feed);
  assert.deepEqual(articles.map((a) => a.description), ["Actual opening.", "Available excerpt.", ""]);
});
