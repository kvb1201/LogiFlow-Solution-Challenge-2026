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

Our scraping strategy is a multi-tiered approach that degrades gracefully if a provider changes their website structure or blocks us. Here is the highly detailed breakdown of how each of the three primary scraping approaches works.

### Approach 1: RailYatri Scraping (`railyatri_client.py`)
RailYatri acts as our primary source for both real-time live tracking ("running status") and discovery of trains between stations.

**1. Live Status HTML Parsing:**
- **Endpoint Target**: We scrape the public `https://www.railyatri.in/live-train-status/{train_number}` page directly using `requests.get()`.
- **Table Extraction Strategy**: Unlike API responses, the data is embedded inside an HTML table. Since standard HTML parsers can be slow or brittle if the DOM changes slightly, we use a robust regular expression approach. We locate `<table>` tags and inspect their `<th>` containing keywords like "station" and "status". 
- **Row Traversal**: Once the correct table is found, we extract `<tr>` cells. For each `<td>`, we clean HTML remnants using `html.unescape()` to extract the exact station name, arrival time, and delay status string (e.g., "Mostly Delayed").
- **Historical Scaling via Query Params**: We discovered through UI inspection that RailYatri accepts `start_date` and `start_day` URL parameters. We loop historical parameters (up to 14 days) and aggregate the scraped statuses to calculate two ML features: **Severity Average** and **Delayed Ratio**.

**2. Trains-Between-Stations & Next.js Hydration:**
- **Primary API**: It first tries `trainticketapi.railyatri.in` with JSON payload.
- **HTML Fallback**: If the API blocks us or enforces authentication, we failover to requesting the browser UI page. Since RailYatri uses modern rendering paradigms, the initial request contains the entire datastructure serialized into a `<script>` tag. We extract the text between `<script id="__NEXT_DATA__">...</script>` or `__INITIAL_STATE__ = {...};`, parse it via `json.loads()`, and navigate the massive JSON tree payload to extract the actual trains connecting the two requested stations.

### Approach 2: ConfirmTkt Scraping (`railradar_client.py`)
If RailYatri fails to find valid routes, the pipeline automatically fails over to the ConfirmTkt provider. ConfirmTkt uses more modern obfuscation techniques, requiring a highly technical two-stage scrape.

**1. The Next.js State Extractor Contextual Parsing:**
- **Endpoint Target**: We scrape `https://www.confirmtkt.com/rbooking/trains/from/{from_slug}/to/{to_slug}/{date}`.
- **Hydration State Extraction**: We use `re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html)` to lift the Next.js framework's state payload.
- **Data Normalization**: We process the massive JSON object payload, dynamically traveling `pageProps.trainsData.trainList` or `pageProps.trainList` to bypass API authorization bounds. We format it into a universal schema (`trainNumber`, `departureMinutes`, `classTypes`) that our logistics ML models expect.

**2. Asset-Derived API Reverse Engineering (The "Bundle Parser" Fallback):**
If Next.js obfuscates the data, ConfirmTkt shifts to an App-client fetching model. To circumvent this, we do on-the-fly reverse engineering:
- **Locating the Frontend Logic**: We use regex to find the module script tag (`<script type="module" src="...">`) injected in the HTML.
- **Asset Download & Inspection**: We make a secondary `requests.get()` to download this `.js` bundle file directly.
- **Regex Heuristics on Javascript**: We scan the raw minified javascript string for patterns looking for variables literally named `apikey` or `clientid`. Through this, we extract internal API credentials (such as `"ct-web!2$"` for the `apikey`).
- **Internal API Request Targeting**: We identify the internal URL `cttrainsapi.confirmtkt.com/api/v1/trains/search` from the js source. We then construct the exact `Headers` their SPA utilizes (including an injection of a generated `uuid` as `deviceid`), mimicking an authenticated internal browser fetch.

### Approach 3: IRCTC Direct Spoofing/Session Mimicry (`railradar_client.py`)
If both aggregator endpoints (RY and CT) utterly fail, the system relies on the final defensive layer: mocking a human user on the official Indian Railways (IRCTC) site.

**1. Session Hydration & Cookie Replay:**
- We instantiate a `requests.Session()` coupled with standard consumer "User-Agent" headers.
- **Cold Call Handshake**: We initiate a GET request to `https://www.irctc.co.in/nget/train-search`. This does not yield train data, but it solves their edge firewall challenges (Akamai) and captures tracking browser cookies. 

**2. Custom Anti-Bot Header Spoofing:**
- IRCTC's API endpoints enforce headers that prove the request originated from their UI javascript. 
- We engineered a bypass by constructing the `greq` header. In our code, we generate this exactly as their frontend code does: `f"{int(time.time() * 1000)}:{uuid.uuid4()}"`. 
- By injecting this dynamically generated token along with the `bmirak` header value `"webbm"`, the IRCTC WAF accepts our synthetic requests as legitimate traffic.

**3. Direct Alt Availability Enforcement (altAvlEnq/TC):**
- With our mock session and tokens primed, we POST directly to `https://www.irctc.co.in/eticketing/protected/mapps1/altAvlEnq/TC` using the `YYYYMMDD` native IRCTC JSON format schema to finally extract exactly what trains exist, falling entirely under the official radar.

---

## 3. Resilience and Fail-Safes

Because web scraping is inherently brittle, the pipeline architecture surrounds the scrapers with massive safety nets:

1. **Multi-layer Caching**: We use Redis (with an in-memory fallback) to cache route queries for 24 hours. Punctuality and Station queries are cached even longer. 
2. **Circuit Breakers**: In `railradar_client.py`, if a scraper fails 5 times consecutively, the circuit breaker trips. The system will "fast-fail" for 60 seconds without attempting HTTP requests to prevent IP bans and keep our API latency low.
3. **Rotating Provider Keys**: For sources that do have APIs (like RapidAPI), we take a comma-separated list of API keys and rotate them via modulo index on every single request. If an API returns a `429 Too Many Requests`, that specific key is placed in a "timeout penalty box" for 5 minutes while the scraper continues with other keys.

## Summary for the Team
By cascading from **Aggregator APIs** -> **Server-Side Render Extractors** -> **Reverse-Engineered App APIs** -> **Session Spoofing**, our Rail Pipeline guarantees a massive hit rate without relying solely on expensive or unavailable official APIs. We then map this scraped data directly into our decision engine to predict ETA, risk, and calculate valid cargo pricing!
