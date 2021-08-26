const streams = require("../streams-lib/wasm-node/iota_streams_wasm");
const fetch = require("node-fetch");
const crypto = require("crypto");
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

    const makeSeed = (size) => {
      const alphabet = "abcdefghijklmnopqrstuvwxyz";
      let seed = "";
      for (let i = 9; i < size; i++) {
        seed += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      return seed;
    };

    const getClient = (node) => {
      const options = new streams.SendOptions(node, true);
      return new streams.Client(node, options.clone());
    };

    // ###############################################
    // #################### Begin ####################
    // ###############################################

    // Generate a unique seed for the author
    const seed = makeSeed(81);

    // generate presharedkey
    const presharedkey = crypto.randomBytes(16).toString("hex");

    // Generate an Author
    let client = getClient(config.node);
    const author = streams.Author.from_client(
      client,
      seed,
      streams.ChannelType.MultiBranch
    );

    // Create the channel with an announcement message. Make sure to save the resulting link somewhere,
    const response = await author.clone().send_announce();
    const ann_link = response.get_link();

    // This link acts as a root for the channel itself
    let ann_link_string = ann_link.to_string();
    console.log(
      `Announcement Link: ${ann_link_string}\nTangle Index: ${JSON.stringify(
        ann_link
      )}\n`
    );

    let id = author.store_psk(presharedkey);

    // Generate an Address object from the provided announcement link string from the Author
    let ann_address = streams.Address.from_string(ann_link_string);

    // author sends keyload using preshared key
    const keys_a = streams.PublicKeys.new();
    let ids = streams.PskIds.new();
    ids.add(id);

    const res = await author
      .clone()
      .send_keyload(ann_address.copy(), ids, keys_a);
    const keyloadLink_a = res?.get_link();
    const sequenceLink_a = res?.get_seq_link()?.to_string();
    console.log(
      `\nSent Keyload for Sub A: ${keyloadLink_a
        .copy()
        .to_string()}, seq: ${sequenceLink_a}`
    );

    // author sends package
    const sendResponse = await author
      .clone()
      .send_signed_packet(
        keyloadLink_a.copy(),
        toBytes(""),
        toBytes("message from the grand author")
      );
    const msg_linkauth = sendResponse.get_link();
    const seq_linkauth = sendResponse.get_seq_link();
    console.log(`Sent msg from Sub A: ${msg_linkauth}, seq: ${seq_linkauth}`);

    // ------------------------------------------------------------------
    // In their own separate instances generate the subscriber(s) that will be attaching to the channel
    client = getClient(config.node);
    let subscriber_a = streams.Subscriber.from_client(client, "SubscriberA");

    // Receive the announcement message to start listening to the channel
    await subscriber_a.clone().receive_announcement(ann_address.copy());

    // subscriber stores psk
    await subscriber_a.clone().store_psk(presharedkey);

    // -----------------------------------------------------------------------------
    // Subscriber A can now fetch these messages from the Author
    await tryFetch(subscriber_a.clone(), "Sub A"); // logs ""
    await tryFetch(subscriber_a.clone(), "Sub A"); // logs "message from the grand author"

    // -----------------------------------------------------------------------------
    await tryFetch(author.clone(), "Author"); // logs nothing
    await tryFetch(author.clone(), "Author"); // logs nothing
  } catch (e) {
    console.log("error:", e);
  }
};

runExample().then(() => console.log("done :)"));
