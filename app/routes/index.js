module.exports = function(app, db, web) {
    const token = process.env.SLACKRONYM_TOKEN;
    const notificationChannel = process.env.SLACKRONYM_NOTIFICATION_CHANNEL;
    const request = require('request');

    const ADD_ACK_ID = 'addAck';
    const DEFINE_ACK_DIALOG_ID = 'defineAckDialog';
    const DUMB_VALUE = 'A very dumb thing that noone will type into the thing';
    const MESSAGE_LOOKUP_ID = 'messageLookUp';
    
    let messageIds = {};


    _getItemAttachment = (item, {update, user, timestamp} = {}) => {
	itemAttachment = {
	    title: `${item.acronym}:`,
	    text: item.definition,
	    fields: []
	}
	if (item.docUrl) {
	    itemAttachment.fields.push({
		title: 'Documentation',
		value: item.docUrl,
		short: false
	    });
	}
	if (user) {
	    itemAttachment.fields.push({
		title: 'Added By',
		value: item.username,
		short: true
	    });
	}
	if (timestamp) {
	    itemAttachment.fields.push({
		title: 'Timestamp',
		value: item.timestamp,
		short: true
	    });
	}
	if (update) {
	    itemAttachment.callback_id = ADD_ACK_ID;
	    itemAttachment.actions = [{
		name: 'request',
		text: 'Update',
		type: 'button',
		value: key
	    }];
	}
	
	return itemAttachment;
    }
    

    _getListResponse = (callback) => {
	db.collection('definitions').distinct('acronym', (err, acronyms) => {
	    if (err) {
		callback({text: 'There was an error trying to get all the available acronyms. Please try again later.'});
	    }
	    else {
		acronyms.sort()
		callback({
		    text: 'Available Acronyms:',
		    attachments: [{text: acronyms.join(', ')}]
		});
	    }
	});
    };


    _getUnknownResponse = (text) => {
	return {
	    text: `We're not sure what \`${text}\` is...`,
	    attachments: [{
		callback_id: ADD_ACK_ID,
		actions:
		[{
		    name: 'request',
		    text: 'We should add it.',
		    type: 'button',
		    value: text
		}, {
		    name: 'dumb',
		    text: 'I was just being dumb.',
		    type: 'button',
		    value: DUMB_VALUE
		}]
	    }]
	};
    }


    _getDefinitionsItem = (acronym, callback) => {
	const cursor = db.collection('definitions').find({acronym: acronym}).sort({timestamp: -1}).limit(1);
	cursor.count((err, count) => {
	    if (err) callback(err);
	    if (!count) {
		return callback(null, {acronym: acronym});
	    }
	});
	cursor.each((err, item) => {
	    if (err) return callback(err);
	    else if (item) return callback(null, item);
	});
	
    }
    

    _openAddDialog = (triggerId, options) => {
	_getDefinitionsItem(options.acronym, (err, item) => {
	    if (err) {
		return console.log('There was an error trying to get a definition:', {error: err});
	    }
	    web.dialog.open({
		trigger_id: triggerId,
		dialog: {
		    callback_id: DEFINE_ACK_DIALOG_ID,
		    title: 'AAA (Add An Acronym)',
		    submit_label: 'Add',
		    notify_on_cancel: true,
		    elements: [
			{
			    type: 'text',
			    label: 'Acronym',
			    name: 'acronym',
			    value: options.acronym
			},
			{
			    type: 'text',
			    label: 'Definition',
			    name: 'definition',
			    optional: true,
			    hint: "If you don't know, just leave it blank and we'll try to figure it out.",
			    value: item.definition
			},
			{
			    type: 'text',
			    label: 'Documentation Link',
			    name: 'docUrl',
			    optional: true,
			    subType: 'url',
			    value: item.docUrl,
			    hint: "FYI: If this is dumb, we'll just remove it... (and ban you ¯\\_(ツ)_/¯)"
			}
		    ]
		}
	    });
	});
    }


    _updateDefinition = ({acronym, definition, docUrl, username}, callback) => {
    	definition = {
    	    acronym: acronym.toUpperCase(),
    	    definition: definition,
	    docUrl: docUrl,
	    username: username,
	    timestamp: new Date().toISOString()
    	};
    	db.collection('definitions').insert(definition, callback);
    }


    _updateMessage = (userId, message) => {
	options = {
	    url: messageIds[userId],
	    headers: {
                Authorization: `Bearer ${token}`,
                'Content-type': 'application/json'
	    },
	    body: JSON.stringify(message)
	};
	request.post(options, (err, response, body) => {
	    console.log('err', err);
	    console.log('response', response);
	    console.log('body', body);
	});
    }
    

    _updateCallback = (err, result, res, userId) => {
	if (err) {
	    res.send('There was... a _problem_...');
	}
	else {
	    item = result.ops[0];
	    let confirmationMessage = {
		text: `We successfully updated the dictionary with your definition of \`${item.acronym}\`.`,
		attachments: [_getItemAttachment(item)]
	    };
	    _updateMessage(userId, confirmationMessage);
	    res.send();

	    let notificationMessage = {
		text: `${item.username} just added or updated this...`,
		channel: notificationChannel,
		attachments: [_getItemAttachment(item, {user: true})]
	    };
	    web.chat.postMessage(notificationMessage);
	}
    }


    _postMessageLookup = ({channel, user, message}) => {
	const words = message.replace(/[^\w\s]/g,'').split(' ').map(x => x.toUpperCase());
	let cursor = db.collection('definitions').aggregate([
	    {$match: {acronym: {$in: words}}},
	    {$sort: {timestamp: -1}},
	    {$group: {
	    	_id: '$acronym',
	    	acronym: {$first: '$acronym'},
	    	definition: {$first: '$definition'},
	    	docUrl: {$first: '$docUrl'}
	    }}
	]);
	cursor.toArray((err, items) => {
	    let attachments = [];
	    let text = 'No acronyms we know about in that message.'
	    if (items) {
		attachments = items.map(_getItemAttachment);
		text = '';
	    }
	    web.chat.postEphemeral({
		text: text,
		channel: payload.channel.id,
		user: payload.user.id,
		attachments: attachments
	    });
	});
    }
    
    
    // Commands from interactive stuff like buttons and dialogs
    app.post('/request', (req, res) => {
	payload = JSON.parse(req.body.payload);
	console.log('/request');
	console.log('payload', payload);
	
	switch (payload.callback_id) {
	case ADD_ACK_ID:
            // Clicked a `We should add it`, `I was just being dumb`, or `Update` button
	    value = payload.actions[0].value;
	    if (value === DUMB_VALUE) return res.send({text: 'https://media1.giphy.com/media/l0ExsczAepXFxWSw8/200.gif'});
	    messageIds[payload.user.id] = payload.response_url;
	    _openAddDialog(payload.trigger_id, {acronym: value});
	    res.send({text: 'Defining an acronym (_like a boss_)'});
	    break;
	case DEFINE_ACK_DIALOG_ID:
	    // Closed the add definitions dialog
	    if (payload.type === 'dialog_cancellation') {
		_updateMessage(payload.user.id, {text: 'You did the right thing.'});
	    }
	    else {
		_updateDefinition({
		    acronym: payload.submission.acronym,
		    definition: payload.submission.definition,
		    docUrl: payload.submission.docUrl,
		    username: payload.user.name
		}, (err, result) => _updateCallback(err, result, res, payload.user.id));
	    }
	    res.send();
	    break;
	case MESSAGE_LOOKUP_ID:
	    // Look up acronyms in a message
	    _postMessageLookup({
		channel: payload.channel.id,
		user: payload.user.id,
		message: payload.message.text
	    });
	    res.send();
	}
    });

    // Main commands
    app.post('/lookup', (req, res) => {
	console.log('/lookup');
	console.log('request body', req.body);

	key = req.body.text.toUpperCase()
	const update = key.split(' ')[0] === 'UPDATE'
	const whodid = key.split(' ')[0] === 'WHODID'
	if (update || whodid) {
	    key = key.split(' ')[1] || '';
	}

	if (['LIST', 'HELP'].includes(key)) {
	    return _getListResponse((response) => res.send(response));
	}

	_getDefinitionsItem(key, (err, item) => {
	    if (err) {
		console.log('err:', err);
		res.send({error: err});
	    }
	    else if (!item.definition) {
		res.send(_getUnknownResponse(req.body.text));
	    }
	    else {
		res.send({text: '', attachments: [_getItemAttachment(item, {update: update, user: whodid, timestamp: whodid})]});
	    }
	});
    });

    // populate all the definitions we had before...
    app.get('/populate', (req, res) => {
	definitions = require('./definitions').definitions;

	definitions.map(def => {
	    console.log(def);
	    _updateDefinition({
		acronym: def.acronym,
		definition: def.definitions,
		username: 'initial data'
	    }, () => {});
	});
    });
};

