module.exports = function(app, db) {
    const request = require('request');

    const ADD_ACK_ID = 'addAck';
    const DEFINE_ACK_DIALOG_ID = 'defineAckDialog';
    
    const token = process.env.SLACKRONYM_TOKEN;

    _getAvailableAcronyms = () => {
	return ['tacos', 'stuff']
    }


    _getListResponse = () => {
        acronyms = _getAvailableAcronyms();
        acronyms.sort()
	return {
	    text: 'Available Acronyms:',
	    attachments: [{text: acronyms.join(', ')}]
	};
    }


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
		    value: 'dumb'
		}]
	    }]
	};
    }


    _getDefinitionsItem = (acronym, callback) => {
	const cursor = db.collection('definitions').find({acronym: acronym}).sort({timestamp: -1}).limit(1);
	cursor.count((err, count) => {
	    if (err) callback(err);
	    console.log('gettttttttttttttttttttttttttttt', count);
	    if (!count) {
		console.log('returing cuz no count');
		return callback(null, {acronym: acronym});
	    }
	});
	cursor.each((err, item) => {
	    if (err) return callback(err);
	    else if (item) return callback(null, item);
	});
	
    }
    

    _openAddDialog = (triggerId, options) => {
	console.log({options: options});
	_getDefinitionsItem(options.acronym, (err, item) => {
	    console.log('item:', item);
	    if (err) {
		console.log('There was an error trying to get a definition:', {error: err});
	    }
	    options = {
		url: 'https://slack.com/api/dialog.open',
		headers: {
		    Authorization: `Bearer ${token}`,
		    'Content-type': 'application/json'
		},
		body: JSON.stringify({
		    trigger_id: triggerId,
		    dialog: {
			callback_id: DEFINE_ACK_DIALOG_ID,
			title: 'AAA (Add An Acronym)',
			submit_label: 'Add',
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
				value: item.docUrl
			    }
			]
		    }
		})
	    }
	    request.post(options, (err, response, body) => {
		console.log('eeeeeeeerrrrrrrrrrooooooooorrrrrrrrrr', err);
		console.log(body);
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


    _updateCallback = (err, item, res) => {
	console.log('in callback');
	if (err) {
	    res.send('There was... a _problem_...');
	}
	else {
	    console.log('successfully created:', item);
	    res.send({text: `We successfully updated the dictionary with your definition of \`${item.acronym}\`.`});
	}
    }
    
    
    app.post('/request', (req, res) => {
	payload = JSON.parse(req.body.payload);
	console.log('payload', payload);
	switch (payload.callback_id) {
	case ADD_ACK_ID:
	    action = payload.actions[0];
	    _openAddDialog(payload.trigger_id, {acronym: action.value});
	    res.send();
	    break;
	case DEFINE_ACK_DIALOG_ID:
	    _updateDefinition({
		acronym: payload.submission.acronym,
		definition: payload.submission.definition,
		docUrl: payload.submission.docUrl,
		username: payload.user.name
	    }, (err, item) => _updateCallback(err, item, res));
	    
	    break;
	}
    });

    app.post('/lookup', (req, res) => {
	console.log('doing a look up');
	key = req.body.text.toUpperCase()
	const update = key.split(' ')[0] === 'UPDATE'
	if (update) {
	    key = key.split(' ')[1] || '';
	}

	if (['LIST', 'HELP'].includes(key)) {
	    res.send(_getListResponse());
	}
	else {
	    
	    const cursor = db.collection('definitions').find({acronym: key}).sort({timestamp: -1}).limit(1)
	    console.log('here');
	    // console.log('count', cursor.count());
	    cursor.count((err, count) => {
		console.log('err:', err);
		console.log('count:', count);
		if (!count) {
		    res.send(_getUnknownResponse(req.body.text));		    
		}
	    });
	    cursor.each((err, item) => {
		console.log(item);
		if (err) {
		    res.send({error: err});
		}
		else if (item){
		    console.log(item);
		    attachments = [{text: item.definition}]
		    if (update) {
			attachments.push({
			    callback_id: ADD_ACK_ID,
			    actions:
			    [{
				name: 'request',
				text: 'Update',
				type: 'button',
				value: key
			    }]
			});
		    }
		    res.send({
			text: `${item.acronym}:`,
			attachments: attachments
		    });
		}
	    });
	// });
	}
    });


    app.post('/add', (req, res) => {
    	definition = {
    	    acronym: req.body.acronym.toUpperCase(),
    	    definition: req.body.definition
    	};
    	db.collection('definitions').insert(definition, (err, result) => {
    	    if (err) {
    		res.send({ 'error': 'Uh.. an error happened' });
    	    }
    	    else {
    		res.send(result.ops[0]);
    	    }
    	});
    });
};

