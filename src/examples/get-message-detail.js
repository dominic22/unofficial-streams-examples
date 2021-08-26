const streams = require("@iota/streams-wasm/node/iota_streams_wasm");
const fetch = require("node-fetch");

streams.set_panic_hook();

global.fetch = fetch;
global.Headers = fetch.Headers;
global.Request = fetch.Request;
global.Response = fetch.Response;

const runExample = async () => {
  try {
    const config = {
      node: "https://chrysalis-nodes.iota.org:443",
    };

    const getClient = (node) => {
      const options = new streams.SendOptions(node, true);
      return new streams.Client(node, options.clone());
    };

    const address = streams.Address.from_string(
      "92a2cdc1d03eebcc6d46dbbbe41ff3e9d7a8b7971da61f128662ba54d10a454e0000000000000000:e87b5ed71dea565dcae035e0"
    );
    const client = getClient(config.node);
    const linkDetails = await client.get_link_details(address);
    console.log(
      "------------- message_id:",
      linkDetails.get_metadata().message_id
    );
  } catch (e) {
    console.log("error:", e);
  }
};

runExample().then(() => console.log("done :)"));
