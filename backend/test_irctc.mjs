import { configure, getTrainInfo } from "irctc-connect";

const origFetch = global.fetch;
global.fetch = async (url, options) => {
  console.log("=== INTERCEPT ===");
  console.log("URL:", url);
  console.log("Method:", options.method);
  console.log("=================");
  return {
    json: async () => ({ success: true, data: "intercepted" }),
    ok: true
  };
};

const keys = (process.env.IRCTC_CONNECT_API_KEYS || "irctc_baf0f8f9c4002fedd8795de2fc09ea0f5cfcc00edf6a83df")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
configure(keys[0]);
getTrainInfo("12283").then(r => console.log(r)).catch(console.log);
