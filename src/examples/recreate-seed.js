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
            console.log("No more found...");
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
                    publicPayload: publicPayload && JSON.parse(publicPayload),
                    maskedPayload: maskedPayload && JSON.parse(maskedPayload),
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
      "75e6f5b0eac94413eda9e153df34ad52f706142dd4071f2b34a039c3a95c793b0000000000000000:57edc89af748d2644f496303";
    let annAddress = streams.Address.from_string(annLink);

    const seed =
      "jpbrpgibzbfsuawxozcelnotlogwyiquvvisqdjcnnnvvvdanjfpuuygksdkhwdngglvajgl";

    const client = getClient(config.node);
    const subscriber_a = streams.Subscriber.from_client(client, seed);
    await subscriber_a.clone().receive_announcement(annAddress.copy());

    const msgs = await fetchMessages(subscriber_a);
    console.log("received messages:", msgs);
    console.log("Caller:", caller);
  } catch (e) {
    console.log("error:", e);
  }
};

runExample().then(() => console.log("done :)"));
