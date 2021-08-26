const streams = require('../streams-lib/wasm-node/iota_streams_wasm');
const fetch = require('node-fetch');
const crypto = require('crypto');
streams.set_panic_hook();

global.fetch = fetch;
global.Headers = fetch.Headers;
global.Request = fetch.Request;
global.Response = fetch.Response;

const runExample = async () => {
	try {
		const config = {
			node: 'https://chrysalis-nodes.iota.org:443'
		};

		const tryFetch = async (sub, caller) => {
			let retrieved = await sub.clone().fetch_next_msgs();
			try {
				retrieved.map((r) => {
					const payload = JSON.stringify(fromBytes(r.get_message().get_masked_payload()));
					console.log(`Received message for: ${caller} - ${payload}`);
					return null;
				});
			} catch (e) {
				console.log('error');
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
			let str = '';
			for (let i = 0; i < bytes.length; ++i) {
				str += String.fromCharCode(bytes[i]);
			}
			return str;
		};

		const makeSeed = (size) => {
			const alphabet = 'abcdefghijklmnopqrstuvwxyz';
			let seed = '';
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
		const presharedkey = crypto.randomBytes(16).toString('hex');

		// Generate an Author
		let client = getClient(config.node);
		const author = streams.Author.from_client(client, seed, streams.ChannelType.MultiBranch);

		// Create the channel with an announcement message. Make sure to save the resulting link somewhere,
		const response = await author.clone().send_announce();
		const ann_link = response.get_link();

		// This link acts as a root for the channel itself
		let ann_link_string = ann_link.to_string();
		console.log(`Announcement Link: ${ann_link_string}\nTangle Index: ${JSON.stringify(ann_link)}\n`);

		let id = author.store_psk(presharedkey);

		// Generate an Address object from the provided announcement link string from the Author
		let ann_address = streams.Address.from_string(ann_link_string);

		// ------------------------------------------------------------------
		// author sends keyload using preshared key
		const keys = streams.PublicKeys.new();
		let ids = streams.PskIds.new();
		ids.add(presharedkey); // SOME DIFFERENT KEY!!

		const res = await author.clone().send_keyload(ann_address.copy(), ids, keys);
		const keyloadLink_a = res?.get_link()?.to_string();
		const sequenceLink_a = res?.get_seq_link()?.to_string();
		console.log(`\nSent Keyload for Sub A: ${keyloadLink_a}, seq: ${sequenceLink_a}`);

		// author sends package
		const sendResponse = await author.clone().send_signed_packet(ann_address.copy(), toBytes(''), toBytes('message from the grand author'));
		const msg_linkauth = sendResponse.get_link();
		const seq_linkauth = sendResponse.get_seq_link();
		console.log('Sent msg from Sub author');
		client = getClient(config.node);
		const linkDetails = await client.get_link_details(msg_linkauth);
		console.log('------------- message_id:', linkDetails.get_metadata().message_id);
		// ------------------------------------------------------------------
		// In their own separate instances generate the subscriber(s) that will be attaching to the channel
		client = getClient(config.node);
		let subscriber_a = streams.Subscriber.from_client(client, 'SubscriberA');

		// Receive the announcement message to start listening to the channel
		await subscriber_a.clone().receive_announcement(ann_address.copy());

		// subscriber stores psk
		await subscriber_a.clone().store_psk('3f92530aa6b31ab21d48ed75cd34af1e');

		client = getClient(config.node);
		const subscriber_b = streams.Subscriber.from_client(client, 'SubscriberB');
		await subscriber_b.clone().receive_announcement(ann_address.copy());

		let subscribe_msg_b = (await subscriber_b.clone().send_subscribe(ann_address.copy())).get_link();
		let sub_msg_b_str = subscribe_msg_b.to_string();
		let sub_b_pk = subscriber_b.clone().get_public_key();
		let sub_b_address = streams.Address.from_string(sub_msg_b_str);

		await author.clone().receive_subscribe(sub_b_address.copy());

		// -----------------------------------------------------------------------------
		// -----------------------------------------------------------------------------
		// A new subscriber SubscriberB is added and sends a signed_packet to his branch
		const keys_b = streams.PublicKeys.new();
		keys_b.add(sub_b_pk);
		ids = streams.PskIds.new();
		console.log('presharedkey', presharedkey);

		ids.add(presharedkey);
		const res_b = await author.clone().send_keyload(ann_address.copy(), ids, keys_b);
		const keyloadLink_b = res_b?.get_link()?.to_string();
		const sequenceLink_b = res_b?.get_seq_link()?.to_string();
		console.log(`\nSent Keyload for Sub B: ${keyloadLink_b}, seq: ${sequenceLink_b}`);

		await subscriber_b.clone().sync_state();
		const prev_msg_link = keyloadLink_b;
		const message = 'very basic message from b';

		const latestAddress = streams.Address.from_string(prev_msg_link);
		const res_signed_package_b = await subscriber_b.clone().send_signed_packet(latestAddress.copy(), toBytes('ssw'), toBytes(message));
		const msg_link_b = res_signed_package_b.get_link();
		const seq_link_b = res_signed_package_b.get_seq_link();
		console.log(`Sent msg from Sub B: ${msg_link_b.to_string()}, seq: ${seq_link_b.to_string()}`);

		// -----------------------------------------------------------------------------
		// -----------------------------------------------------------------------------
		// -----------------------------------------------------------------------------
		// Subscriber A can now fetch these messages from the Author but not receving them from sub b
		await tryFetch(subscriber_a.clone(), 'Sub A'); // logs ""
		// subscriber_a should not be able to log this log since he has a wrong presharedkey
		await tryFetch(subscriber_a.clone(), 'Sub A'); // logs "message from the grand author"
		await tryFetch(subscriber_a.clone(), 'Sub A'); // logs ""
		await tryFetch(subscriber_a.clone(), 'Sub A'); // logs nothing

		// -----------------------------------------------------------------------------
		// Author can now fetch these messages
		await tryFetch(author.clone(), 'Author'); // logs 'very basic message from b'
		await tryFetch(author.clone(), 'Author'); // logs nothing
	} catch (e) {
		console.log('error:', e);
	}
};

runExample().then(() => console.log('done :)'));
