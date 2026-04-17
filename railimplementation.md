# Rail Cargo Pipeline Implementation: A Deep Dive into Web Scraping & Orchestration

This document explains exactly how we implemented the railway logistics pipeline using an advanced web scraping and multi-tiered fallback architecture. You can use this guide to explain the technical details of the pipeline to the rest of the team.

## 1. Overview of the Pipeline (`pipeline.py`)
Our Rail Pipeline (`RailPipeline`) calculates optimal end-to-end railway cargo routes. It doesn't just look up trains; it evaluates real-world punctuality, integrates machine learning to predict delays, and calculates official parcel costs. 

The pipeline works in these sequential stages:
1. **Route Discovery**: Finds train routes between Origin and Destination.
2. **Feature Engineering / Scraping**: Enriches route data with historical punctuality, weather risks, and live running status by scraping various portals.
3. **ML Prediction**: Adjusts durations using `predict_delay` to get real-world arrival times.
4. **Decision Engine**: Sorts the candidates based on time, cost, and risk, delivering the 'best' and 'alternative' routes.

Because official Indian Railways APIs are heavily restricted, we built a **highly resilient scraper network** to gather this data.

---

## 2. Deep Dive: Web Scraping Strategies

Our scraping strategy is a multi-tiered approach that degrades gracefully if a provider changes their website structure or blocks us.

### Tier 1: RailYatri Scraping (`railyatri_client.py`)
RailYatri is our primary source for real-time train running status and historical performance (which drives our ML models).
* **Live Status Extraction**: We fetch the live status page for a train. Since the page doesn't expose clean JSON, we use Python's `re` module to parse the HTML document. We identify the correct `<table>` containing station data by scanning table headers (`<th>`) for keywords like "station" and "status". We then iterate over the table rows (`<tr>` and `<td>`), cleaning out HTML tags using `html.unescape` and regex to build an array of stop dictionaries.
* **Historical Severity Assessment**: We fetch past status records (up to 14 days back) using undocumented `start_date` and `start_day` query parameters. We calculate a "delayed ratio" and "severity average" by categorizing scraped status text (e.g., extracting "Mostly Delayed", "Irregular" or "On Time") into numerical penalty values.
* **Trains-Between-Stations (HTML State Fallback)**: If the public API fails, we fetch the RailYatri booking page HTML. Since it is a modern web app, the data is preloaded into the DOM. We use regex to extract the payload from `<script id="__NEXT_DATA__">` or `__INITIAL_STATE__ = {...};`, parse it as JSON, and normalize the train list.

### Tier 2: ConfirmTkt Next.js & Asset Reverse Engineering (`railradar_client.py`)
If RailYatri fails to find trains, we failover to ConfirmTkt.
* **Next.js Hydration Scraping**: ConfirmTkt is built with Next.js. Similar to RailYatri, we fetch the HTML response and use regex to pull out the `<script id="__NEXT_DATA__">` tag, converting the massive hydration state into a JSON object and filtering down to `pageProps.trainsData.trainList`.
* **Asset-Derived API Reverse Engineering (Advanced)**: If the Next.js state isn't present, we look for the main JavaScript bundle `<script type="module" src="...bundle.js">`. We download the JS bundle itself, run regex over the minified code, and extract internal API keys (like `"ct-web!2$"`), client IDs, and undocumented API endpoints. We then dynamically construct headers (`apikey`, `clientid`, `deviceid`) and directly query their undocumented backend API.

### Tier 3: IRCTC Direct (Session Mimicry)
If aggregator sites fail entirely, we emulate a browser session interacting with the official IRCTC domain.
* **Session Initialization**: We use `requests.Session()` with spoofed User-Agent headers to visit the IRCTC homepage, grabbing essential tracking cookies and anti-bot tokens.
* **Header Spoofing**: IRCTC has bot-protection that checks for specific browser-generated headers. We generate a custom `greq` header (`timestamp:uuid-v4`) as the browser would, passing it to `altAvlEnq/TC` via a POST request to bypass protection cleanly.

### Tier 4: Generic Pandas HTML Extractor
As a last resort for customized URLs (defined in `.env`), we use `pandas.read_html` which automatically detects `<table>` tags in a fetched DOM. We iterate over the extracted DataFrames looking for columns matching "Train No" or "Departure", and construct a normalized train object.

---

## 3. Resilience and Fail-Safes

Because web scraping is inherently brittle, the pipeline architecture surrounds the scrapers with massive safety nets:

1. **Multi-layer Caching**: We use Redis (with an in-memory fallback) to cache route queries for 24 hours. Punctuality and Station queries are cached even longer. 
2. **Circuit Breakers**: In `railradar_client.py`, if a scraper fails 5 times consecutively, the circuit breaker trips. The system will "fast-fail" for 60 seconds without attempting HTTP requests to prevent IP bans and keep our API latency low.
3. **Rotating Provider Keys**: For sources that do have APIs (like RapidAPI), we take a comma-separated list of API keys and rotate them via modulo index on every single request. If an API returns a `429 Too Many Requests`, that specific key is placed in a "timeout penalty box" for 5 minutes while the scraper continues with other keys.

## Summary for the Team
By cascading from **Aggregator APIs** -> **Server-Side Render Extractors** -> **Reverse-Engineered App APIs** -> **Session Spoofing**, our Rail Pipeline guarantees a massive hit rate without relying solely on expensive or unavailable official APIs. We then map this scraped data directly into our decision engine to predict ETA, risk, and calculate valid cargo pricing!
