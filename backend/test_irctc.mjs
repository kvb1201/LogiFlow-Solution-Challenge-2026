import { configure, searchTrainBetweenStations } from "irctc-connect";

const origFetch = global.fetch;
global.fetch = async (url, options) => {
  console.log("=== INTERCEPT ===");
  console.log("URL:", url);
  console.log("Method:", options.method);
  console.log("Headers:", JSON.stringify(options.headers, null, 2));
  console.log("=================");
  return {
    json: async () => ({ success: true, data: "intercepted" })
  };
};

const keys = (process.env.IRCTC_CONNECT_API_KEYS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
configure(process.env.IRCTC_API_KEY || keys[0] || "");
searchTrainBetweenStations("NDLS", "BCT").then(console.log).catch(console.log);
