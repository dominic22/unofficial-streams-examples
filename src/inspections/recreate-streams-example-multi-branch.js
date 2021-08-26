const streams = require("../streams-lib/wasm-node/iota_streams_wasm");
const fetch = require("node-fetch");
streams.set_panic_hook();

global.fetch = fetch;
global.Headers = fetch.Headers;
global.Request = fetch.Request;
global.Response = fetch.Response;

const runExample = async () => {
  try {
    console.log(
      "Time:",
      new Date().toLocaleDateString(),
      new Date().toLocaleTimeString()
    );
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

    // -----------------------------------------------------------------------------
    // -----------------------------------------------------------------------------
    // -----------------------------------------------------------------------------
    // -----------------------------------------------------------------------------
    // Generate a unique seed for the author
    const seed = makeSeed(81);
    // Create the Transport Client

    let client = getClient(config.node);
    // Generate an Author
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
      `##########\n##########\nAnnouncement Link: ${ann_link_string}\n##########\n##########`
    );

    // ------------------------------------------------------------------
    // In their own separate instances generate the subscriber(s) that will be attaching to the channel
    client = getClient(config.node);
    const subscriber_a = streams.Subscriber.from_client(client, "SubscriberA");

    client = getClient(config.node);
    const subscriber_b = streams.Subscriber.from_client(client, "SubscriberB");

    // Generate an Address object from the provided announcement link string from the Author
    let ann_address = streams.Address.from_string(ann_link_string);

    // Receive the announcement message to start listening to the channel
    await subscriber_a.clone().receive_announcement(ann_address.copy());
    await subscriber_b.clone().receive_announcement(ann_address.copy());

    // Subscribers send subscription messages linked to announcement message
    let subscribe_msg_a = (
      await subscriber_a.clone().send_subscribe(ann_address.copy())
    ).get_link(); // TODO check if get_link should be used or not!
    let subscribe_msg_b = (
      await subscriber_b.clone().send_subscribe(ann_address.copy())
    ).get_link();

    // These are the subscription links that should be provided to the Author to complete subscription
    let sub_msg_a_str = subscribe_msg_a.to_string();
    let sub_msg_b_str = subscribe_msg_b.to_string();

    // -----------------------------------------------------------------------------
    // Fetch subscriber public keys (for use by author in issuing a keyload)
    let sub_a_pk = subscriber_a.clone().get_public_key();
    let sub_b_pk = subscriber_b.clone().get_public_key();

    // ----------------------------------------------------------------------
    // Get Address object from subscription message link provided by Subscriber A
    let sub_a_address = streams.Address.from_string(sub_msg_a_str);

    // Get Address object from subscription message link provided by SubscriberB
    let sub_b_address = streams.Address.from_string(sub_msg_b_str);

    // Author processes subscription messages
    await author.clone().receive_subscribe(sub_a_address.copy());
    await author.clone().receive_subscribe(sub_b_address.copy());

    // Expectant users are now ready to be included in Keyload messages

    // -----------------------------------------------------------------------------
    // Author sends keyload with the public key of Sub A (linked to announcement message) to generate
    // a new branch. This will return a tuple containing the message links. The first is the message
    // link itself, the second is a sequencing message.
    const keys_a = streams.PublicKeys.new();
    keys_a.add(sub_a_pk);
    // -----------------------------------------------------------------------------
    keys_a.add(sub_b_pk);
    // -----------------------------------------------------------------------------
    let ids = streams.PskIds.new();
    const res = await author
      .clone()
      .send_keyload(ann_address.copy(), ids, keys_a);
    const keyloadLink_a = res?.get_link()?.to_string();

    // -----------------------------------------------------------------------------
    // Author will send the second Keyload with the public key of Subscriber B (also linked to the
    // announcement message) to generate another new branch
    // link itself, the second is a sequencing message.
    const keys_b = streams.PublicKeys.new();
    keys_b.add(sub_b_pk);
    // ---------------------------------------------------------------------------------------------------------------------------------
    keys_b.add(sub_a_pk);
    // ---------------------------------------------------------------------------------------------------------------------------------
    ids = streams.PskIds.new();

    const res_b = await author
      .clone()
      .send_keyload(ann_address.copy(), ids, keys_b);
    const keyloadLink_b = res_b?.get_link()?.to_string();

    // Before sending any messages, a publisher in a multi publisher channel should sync their state
    // to ensure they are up to date
    await subscriber_a.clone().sync_state();
    await subscriber_b.clone().sync_state();

    // -----------------------------------------------------------------------------
    // Subscriber A will now send signed encrypted messages in a chain attached to Keyload A
    let prev_msg_link = keyloadLink_a;
    let message = "very basic message from a";
    let latestAddress = streams.Address.from_string(prev_msg_link);
    const res_signed_package_a = await subscriber_a
      .clone()
      .send_signed_packet(latestAddress, toBytes(""), toBytes(message));
    const msg_link = res_signed_package_a.get_link();
    console.log(`Sent msg from Sub A: ${msg_link.to_string()})}`);
    prev_msg_link = msg_link;

    const msgs_subscriber_b = await fetchMessages(subscriber_b);
    console.log(
      "-----------------------------------------------------------------------------"
    );
    console.log("Messages of msgs_subscriber_b:", msgs_subscriber_b); // OK fetches message of the subscriber_a
    console.log(
      "-----------------------------------------------------------------------------"
    );

    // -----------------------------------------------------------------------------
    // Subscriber B will now send signed encrypted messages in a chain attached to Keyload B
    prev_msg_link = keyloadLink_b;
    message = "very basic message from b";

    latestAddress = streams.Address.from_string(prev_msg_link);
    const res_signed_package_b = await subscriber_b
      .clone()
      .send_signed_packet(latestAddress.copy(), toBytes(""), toBytes(message));
    const msg_link_b = res_signed_package_b.get_link();
    console.log(`Sent msg from Sub B: ${msg_link_b.to_string()}`);

    // -----------------------------------------------------------------------------
    latestAddress = msg_link_b;
    message = "2nd very basic message from b";
    const res_signed_package_b2 = await subscriber_b
      .clone()
      .send_signed_packet(latestAddress.copy(), toBytes(""), toBytes(message));
    const msg_link_b2 = res_signed_package_b2.get_link();
    console.log(`Sent msg 2 from Sub B: ${msg_link_b2.to_string()}`);
    console.log(
      "-----------------------------------------------------------------------------"
    );
    // -----------------------------------------------------------------------------
    const msgs_subscriber_a = await fetchMessages(subscriber_a);
    console.log("Messages of msgs_subscriber_a:", msgs_subscriber_a); // OK fetches all 2 messages of the subscriber_b
    console.log(
      "-----------------------------------------------------------------------------"
    );
    // -----------------------------------------------------------------------------
    const msgs_author = await fetchMessages(author);
    console.log("Messages of Author:", msgs_author); // OK fetches all 3 messages of the subscribers
    console.log(
      "-----------------------------------------------------------------------------"
    );

    // -----------------------------------------------------------------------------
    // -----------------------------------------------------------------------------
    // Newly create subscriptions and fetch data again
    // -----------------------------------------------------------------------------
    // -----------------------------------------------------------------------------
    client = getClient(config.node);
    const subscriber_a2 = streams.Subscriber.from_client(client, "SubscriberA");
    await subscriber_a2.clone().receive_announcement(ann_address.copy());
    const msgs = await fetchMessages(subscriber_a2);
    console.log("Messages of SubA:", msgs); // ERROR this varies sometimes it finds messages, sometimes not, sometimes only of b, sometimes only its own
    console.log(
      "-----------------------------------------------------------------------------"
    );
    client = getClient(config.node);
    const subscriber_b2 = streams.Subscriber.from_client(client, "SubscriberB");
    await subscriber_b2.clone().receive_announcement(ann_address.copy());
    const msgs_b = await fetchMessages(subscriber_b2);
    console.log("Messages of SubB:", msgs_b); // ERROR this varies sometimes it finds messages, sometimes not, sometimes only of a, sometimes only its own
  } catch (e) {
    console.log("error:", e);
  }
};
runExample().then(() => console.log("done :)"));
