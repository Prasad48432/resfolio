/** Recorded feed bodies for the RSS/Atom parse + normalize tests. */

/** RSS 2.0 (Medium/WordPress/Substack shape): two items, one with HTML in the
 * description and a `content:encoded`, one minimal. */
export const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Ada&#39;s Notes</title>
    <link>https://ada.example/blog</link>
    <description>Essays on systems.</description>
    <item>
      <title>On Structured Logging</title>
      <link>https://ada.example/blog/structured-logging</link>
      <guid isPermaLink="false">post-42</guid>
      <pubDate>Mon, 03 Jun 2024 09:00:00 GMT</pubDate>
      <description>&lt;p&gt;Why &lt;strong&gt;structure&lt;/strong&gt; beats grep.&lt;/p&gt;</description>
    </item>
    <item>
      <title>Quiet Interfaces</title>
      <link>https://ada.example/blog/quiet-interfaces</link>
      <pubDate>Tue, 12 Mar 2024 08:30:00 GMT</pubDate>
      <description>A short note.</description>
    </item>
  </channel>
</rss>`;

/** Atom (single entry, link as an attributed element). */
export const atomFeed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Jun's Journal</title>
  <link href="https://jun.example/" rel="alternate"/>
  <entry>
    <title>Designing for Trust</title>
    <link href="https://jun.example/trust" rel="alternate"/>
    <id>tag:jun.example,2024:/trust</id>
    <updated>2024-05-20T14:00:00Z</updated>
    <summary>Notes on review-first product design.</summary>
  </entry>
</feed>`;
