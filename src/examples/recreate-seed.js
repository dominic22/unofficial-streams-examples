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
    const fetchMessages = async (subscription) => {
      try {
        let foundNewMessage = true;
        let streamsMessages = [];

        while (foundNewMessage) {
          let nextMessages = [];

          nextMessages = await subscription.clone().fetch_next_msgs();

          if (!nextMessages || nextMessages.length === 0) {
            foundNewMessage = false;
          }

          if (nextMessages && nextMessages.length > 0) {
            const cData = await Promise.all(
              nextMessages.map(async (messageResponse) => {
                const address = messageResponse?.get_link();
                const link = address?.copy()?.to_string();
                const message = messageResponse.get_message();
                const publicPayload =
                  message && fromBytes(message.get_public_payload());
                const maskedPayload =
                  message && fromBytes(message.get_masked_payload());

                try {
                  if (!publicPayload && !maskedPayload) {
                    return null;
                  }
                  const linkDetails = await getClient(
                    config.node
                  )?.get_link_details(address?.copy());
                  const messageId = linkDetails?.get_metadata()?.message_id;

                  return {
                    link,
                    messageId,
                    publicPayload: publicPayload,
                    maskedPayload: maskedPayload,
                  };
                } catch (e) {
                  return null;
                }
              })
            );
            streamsMessages = [...streamsMessages, ...cData];
          }
        }

        return streamsMessages.filter((m) => m);
      } catch (error) {
        console.log("error:", error);
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
      "35436d85795837f18c48f354365df8cb54ed953c29bf84d5d59d01a9f8259cc80000000000000000:6628c5dfa8dfd68805e4e455";
    let annAddress = streams.Address.from_string(annLink);

    const seed = "SubscriberA";

    let client = getClient(config.node);
    const subscriber_a = streams.Subscriber.from_client(client, seed);
    await subscriber_a.clone().receive_announcement(annAddress.copy());
    const msgs = await fetchMessages(subscriber_a);
    console.log("received messages for SubA:", msgs);
  } catch (e) {
    console.log("error:", e);
  }
};

runExample().then(() => console.log("done :)"));
