const streams = require("../streams-lib/wasm-node/iota_streams_wasm");
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
    const tryFetch = async (sub, caller) => {
      let retrieved = await sub.clone().fetch_next_msgs();
      try {
        retrieved.map((r) => {
          const payload = JSON.stringify(
            fromBytes(r.get_message().get_masked_payload())
          );
          console.log(`Received message for: ${caller} - ${payload}`);
          return null;
        });
      } catch (e) {
        console.log("error");
      }
    };

    const toBytes = (str) => {
      const bytes = new Uint8Array(str.length);
      for (let i = 0; i < str.length; ++i) {
        bytes[i] = str.charCodeAt(i);
      }
      return bytes;
    };

    const fromBytes = (bytes) => {
      let str = "";
      for (let i = 0; i < bytes.length; ++i) {
        str += String.fromCharCode(bytes[i]);
      }
      return str;
    };

    const getClient = (node) => {
      const options = new streams.SendOptions(node, true);
      return new streams.Client(node, options.clone());
    };
    const annLink =
      "4151e7b76062548e595fb3ef1624493b45ecf67b237e947a4f533c594f3a24190000000000000000:200e75eeb827e7a02069ee41";
    let annAddress = streams.Address.from_string(annLink);

    const seed =
      "xyysaaaudehcewtwgplfonzpynevlxxukclajoekvgjujjqxahmbekzthidkjhuiljjfxdix";

    const client = getClient(config.node);
    let subscriber_a = streams.Subscriber.from_client(client, seed);
    await subscriber_a.clone().receive_announcement(annAddress.copy());

    await tryFetch(subscriber_a.clone(), "Sub A"); // logs "message from the grand author"
    await tryFetch(subscriber_a.clone(), "Sub A"); // logs ""
    await tryFetch(subscriber_a.clone(), "Sub A"); // logs nothing
    await tryFetch(subscriber_a.clone(), "Sub A"); // logs nothing
    await tryFetch(subscriber_a.clone(), "Sub A"); // logs nothing
    await tryFetch(subscriber_a.clone(), "Sub A"); // logs nothing
    await tryFetch(subscriber_a.clone(), "Sub A"); // logs nothing
    await tryFetch(subscriber_a.clone(), "Sub A"); // logs nothing
    await tryFetch(subscriber_a.clone(), "Sub A"); // logs nothing
  } catch (e) {
    console.log("error:", e);
  }
};

runExample().then(() => console.log("done :)"));
